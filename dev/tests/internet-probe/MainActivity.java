package au.aumanet.internetprobe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.net.*;
import android.widget.TextView;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import javax.net.ssl.*;

/** Separate test UID: uses ordinary default networking, never Network.bindSocket,
 * VpnService.protect, an app proxy or an AuMaNET RPC. Fixed public endpoints only.
 * No packet payload, address, subscription or certificate is saved in results. */
public final class MainActivity extends Activity {
  private TextView view;private volatile String activeRun="";
  @Override public void onCreate(Bundle saved){super.onCreate(saved);view=new TextView(this);view.setPadding(24,32,24,24);setContentView(view);begin();}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);begin();}
  private void begin(){view.setText("AuMaNET independent network test\nRunning…");
    String run=getIntent().getStringExtra("runId"),scenario=getIntent().getStringExtra("scenario");
    if(run==null||!run.matches("[a-f0-9]{32}")||!Arrays.asList("connected","connected-direct","blocked","baseline").contains(scenario)){view.setText("Explicit test run and scenario required.");return;}
    activeRun=run;new Thread(()->execute(run,scenario),"AuMaNET-independent-network-test").start();
  }
  interface Check {JSONObject run()throws Exception;}
  private JSONObject check(String name,Check task){long start=android.os.SystemClock.elapsedRealtime();JSONObject result=new JSONObject();try{result=task.run();result.put("passed",true);}catch(Exception failure){try{result.put("passed",false).put("failure",failure.getClass().getSimpleName());}catch(Exception ignored){}}try{result.put("name",name).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-start);}catch(Exception ignored){}return result;}
  private void execute(String run,String scenario){JSONObject result=new JSONObject();try{
    ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);Network active=cm.getActiveNetwork();NetworkCapabilities caps=active==null?null:cm.getNetworkCapabilities(active);LinkProperties links=active==null?null:cm.getLinkProperties(active);
    boolean vpn=caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    result.put("schema","aumanet.independent-internet-probe.v1").put("runId",run).put("scenario",scenario).put("uid",android.os.Process.myUid()).put("defaultVpn",vpn).put("defaultPresent",active!=null).put("observedAt",System.currentTimeMillis());
    JSONArray checks=new JSONArray();
    if(scenario.equals("connected")||scenario.equals("connected-direct")){
      if(scenario.equals("connected"))checks.put(check("default-network-is-vpn",()->{if(!vpn)throw new IOException();return new JSONObject();}));
      final InetAddress dns=links==null||links.getDnsServers().isEmpty()?null:links.getDnsServers().get(0);
      checks.put(check("uncached-udp-dns",()->dns(dns)));
      checks.put(check("default-tcp-http",()->http(false,15000)));
      checks.put(check("default-tcp-https",()->http(true,15000)));
      checks.put(check("default-udp-stun",MainActivity::stun));
    }else{
      checks.put(check("default-internet-blocked",()->{boolean connected=false;try{directTls();connected=true;}catch(Exception expected){}if(connected)throw new IOException();return new JSONObject().put("independentOfDns",true);}));
    }
    boolean passed=true;for(int i=0;i<checks.length();i++)passed&=checks.getJSONObject(i).getBoolean("passed");result.put("checks",checks).put("passed",passed);
    if(!run.equals(activeRun))return;File target=new File(getFilesDir(),"probe-result.json"),temp=new File(getFilesDir(),"probe-result.pending");try(FileOutputStream out=new FileOutputStream(temp)){out.write(result.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(!temp.renameTo(target))throw new IOException();
  }catch(Exception failed){try{result.put("passed",false).put("failure",failed.getClass().getSimpleName());}catch(Exception ignored){}}
    if(!run.equals(activeRun))return;final String rendered=result.toString();android.util.Log.i("AuMaNETInternetProbe",rendered);runOnUiThread(()->{if(run.equals(activeRun))view.setText("AuMaNET independent network test\n\n"+rendered);});
  }
  // No DNS dependency: successful authenticated TLS proves an external path,
  // whereas a local userspace TCP SYN acknowledgement alone would not.
  private static void directTls()throws Exception{try(Socket raw=new Socket()){
    raw.connect(new InetSocketAddress(InetAddress.getByAddress(new byte[]{1,1,1,1}),443),5000);raw.setSoTimeout(5000);
    try(SSLSocket secure=(SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(raw,"one.one.one.one",443,true)){
      SSLParameters p=secure.getSSLParameters();p.setEndpointIdentificationAlgorithm("HTTPS");secure.setSSLParameters(p);secure.setSoTimeout(5000);secure.startHandshake();
    }
  }}
  private static Inet4Address ipv4(String name)throws Exception{for(InetAddress a:InetAddress.getAllByName(name))if(a instanceof Inet4Address)return(Inet4Address)a;throw new UnknownHostException();}
  private static JSONObject dns(InetAddress server)throws Exception{
    if(server==null)throw new IOException();int id=new SecureRandom().nextInt(65536);ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);out.writeShort(id);out.writeShort(0x0100);out.writeShort(1);out.writeShort(0);out.writeShort(0);out.writeShort(0);for(String label:"example.com".split("\\.")){byte[] b=label.getBytes(StandardCharsets.US_ASCII);out.writeByte(b.length);out.write(b);}out.writeByte(0);out.writeShort(1);out.writeShort(1);byte[] query=bytes.toByteArray();
    try(DatagramSocket socket=new DatagramSocket()){socket.setSoTimeout(15000);socket.connect(server,53);socket.send(new DatagramPacket(query,query.length));byte[] reply=new byte[2048];DatagramPacket p=new DatagramPacket(reply,reply.length);socket.receive(p);if(p.getLength()<12||((reply[0]&255)<<8|(reply[1]&255))!=id||(reply[2]&128)==0||(reply[3]&15)!=0||((reply[6]&255)<<8|(reply[7]&255))<1)throw new IOException();return new JSONObject().put("responseBytes",p.getLength());}
  }
  private static JSONObject http(boolean tls,int timeout)throws Exception{
    String host="example.com";Socket raw=new Socket();try{raw.connect(new InetSocketAddress(ipv4(host),tls?443:80),timeout);raw.setSoTimeout(timeout);Socket connection=raw;
      if(tls){SSLSocket secure=(SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(raw,host,443,true);SSLParameters parameters=secure.getSSLParameters();parameters.setEndpointIdentificationAlgorithm("HTTPS");secure.setSSLParameters(parameters);secure.setSoTimeout(timeout);secure.startHandshake();connection=secure;}
      try(Socket finished=connection){finished.getOutputStream().write(("GET / HTTP/1.1\r\nHost: "+host+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));ByteArrayOutputStream content=new ByteArrayOutputStream();byte[] buffer=new byte[2048];for(int n;(n=finished.getInputStream().read(buffer))!=-1;){if(content.size()+n>32768)throw new IOException();content.write(buffer,0,n);}String text=content.toString("UTF-8");if(!text.startsWith("HTTP/1.1 200")&&!text.startsWith("HTTP/1.0 200"))throw new IOException();if(!text.contains("Example Domain"))throw new IOException();return new JSONObject().put("responseBytes",content.size()).put("tls",tls);}
    }finally{raw.close();}
  }
  private static JSONObject stun()throws Exception{
    byte[] request=new byte[20];request[1]=1;request[4]=0x21;request[5]=0x12;request[6]=(byte)0xa4;request[7]=0x42;byte[] transaction=new byte[12];new SecureRandom().nextBytes(transaction);System.arraycopy(transaction,0,request,8,12);
    try(DatagramSocket socket=new DatagramSocket()){socket.setSoTimeout(15000);socket.connect(ipv4("stun.l.google.com"),19302);socket.send(new DatagramPacket(request,request.length));byte[] reply=new byte[2048];DatagramPacket packet=new DatagramPacket(reply,reply.length);socket.receive(packet);if(packet.getLength()<20||reply[0]!=1||reply[1]!=1||!Arrays.equals(Arrays.copyOfRange(reply,4,8),Arrays.copyOfRange(request,4,8))||!Arrays.equals(Arrays.copyOfRange(reply,8,20),transaction))throw new IOException();return new JSONObject().put("responseBytes",packet.getLength());}
  }
}
