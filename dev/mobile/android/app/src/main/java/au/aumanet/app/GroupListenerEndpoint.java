package au.aumanet.app;

import java.io.IOException;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;

/** Stable endpoint policy only; endpoint possession never replaces the pinned TLS identity. */
final class GroupListenerEndpoint {
    private GroupListenerEndpoint(){}

    static int resumePort(String savedHost,String selectedHost,int savedPort){
        GroupWire.privateIPv4(savedHost);GroupWire.privateIPv4(selectedHost);
        if(savedPort<1024||savedPort>65535)throw new IllegalStateException("Saved local group port is invalid; resume cannot allocate a replacement endpoint");
        // The endpoint may move only during explicit Resume. Scoped discovery supplies
        // untrusted hints; enrolled members still authenticate the full saved TLS pin.
        return savedPort;
    }

    static void bind(ServerSocket listener,InetAddress address,int requestedPort)throws IOException{
        if(requestedPort!=0&&(requestedPort<1024||requestedPort>65535))throw new IllegalArgumentException("Invalid local group listener port");
        // Android's ServerSocket contract requires reuse to be selected before binding to
        // permit restart while old connections remain in TIME_WAIT. It does not bypass an
        // active listener. https://developer.android.com/reference/java/net/ServerSocket#setReuseAddress(boolean)
        listener.setReuseAddress(true);
        try{listener.bind(new InetSocketAddress(address,requestedPort),4);}
        catch(BindException occupied){
            if(requestedPort==0)throw occupied;
            BindException retry=new BindException("Saved local group port is still in use; wait for socket cleanup, then retry Resume");
            retry.initCause(occupied);throw retry;
        }
        // Caller may make exactly one fresh allocation during explicit owner recovery,
        // preserving the FD budget, then commit before advertising the new endpoint.
    }
    static boolean fallback(boolean resume,int savedPort,int attempt,Exception failure){return resume&&savedPort>=1024&&savedPort<=65535&&attempt==0&&failure instanceof BindException;}
}
