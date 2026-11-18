package au.aumanet.app;
import java.io.*;import java.net.*;import java.util.*;import org.json.*;
/** Exact production perform method with declared UDP, file and quiet boundaries. */
public final class GatewayRadioOperationTest {
 static void rebootedRollbackReadback()throws Exception{
  count++;GatewayRadioOperationHarness h=setup();h.run();
  for(int mode=0;mode<4;mode++){
   GatewayRadioReconcileHarness r=new GatewayRadioReconcileHarness();r.unresolved=new JSONObject(h.lastSaved.toString());SystemClock.now=100;
   GatewayRadioConfigCodec.Message ap=GatewayRadioSettingsTest.report(false,"9".repeat(32),0,mode==2?22:5,5,7,"0".repeat(32));
   if(mode==1){byte[] raw=ap.body();raw[224]=14;ap=GatewayRadioConfigCodec.parse(raw);}if(mode==3)r.unresolved.put("epoch",2);
   r.reconcile(new GatewayRadioReconcileHarness.Reading[]{new GatewayRadioReconcileHarness.Reading(ap,100,100),new GatewayRadioReconcileHarness.Reading(GatewayRadioSettingsTest.report(true,GatewayRadioSettingsTest.BRUN,0,5,0,0,"0".repeat(32)),100,100)});
   check(mode==0?r.state.equals("rolled-back")&&r.unresolved==null:r.unresolved!=null&&r.cleared==0);
  }
 }
 static void peerTransportBarrier()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.run();check(h.state.equals("applied")&&h.transportChecks==1);h=setup();h.barrierFail=true;h.run();check(h.state.equals("unknown")&&h.trials==1&&h.commits==1&&h.transportChecks==1&&h.unresolved!=null&&h.quietClosed==1);}
 static void preflightReadRetries()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.preflightTimeouts=1;h.preflightStale=1;h.run();check(h.state.equals("applied"));check(h.trials==1&&h.commits==1&&h.queries==5);GatewayRadioOperationHarness unavailable=setup();unavailable.preflightTimeouts=4;unavailable.run();check(unavailable.state.equals("failed"));check(unavailable.trials==0&&unavailable.commits==0&&unavailable.saved==0&&unavailable.queries==3&&unavailable.quietClosed==1);}
 static int count,assertions;static void check(boolean b){assertions++;if(!b)throw new AssertionError("Radio operation lifecycle regression");}
 static GatewayRadioOperationHarness setup()throws Exception{SystemClock.now=100;GatewayRadioOperationHarness h=new GatewayRadioOperationHarness();h.begin();return h;}
 static void success()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.run();check(h.state.equals("applied"));check(h.trials==1&&h.commits==1);check(h.unresolved==null&&h.saved==1&&h.cleared==1);check(h.published==2&&h.active.get()==null);check(h.quietClosed==1);}
 static void lostTrialAndCommit()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.loseTrial=true;h.loseCommit=true;h.run();check(h.state.equals("applied"));check(h.trials==1&&h.commits==1);check(h.unresolved==null);}
 static void wrongB()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.wrongB=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==0);check(h.unresolved!=null&&h.quietClosed==1);}
 static void stop()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.cancelAfterTrial=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==0);check(h.unresolved!=null);GatewayRadioOperationHarness pre=setup();pre.allowed=false;pre.run();check(pre.state.equals("failed"));check(pre.trials==0&&pre.commits==0&&pre.saved==0);}
 static void unknownCommit()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.unknownCommit=true;h.loseCommit=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==1);check(h.unresolved!=null&&h.error.equals("RADIO_COMMIT_OUTCOME_UNKNOWN"));}
 static void storageBeforeMutation()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.storageFault=true;h.run();check(h.state.equals("failed"));check(h.trials==0&&h.commits==0);check(h.quietClosed==1&&h.active.get()==null);}
 static void reassociationRetry()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.associationTimeouts=2;h.run();check(h.state.equals("applied"));check(h.queries>=5&&h.trials==1&&h.commits==1);}
 static void nonceAge()throws Exception{count++;GatewayRadioOperationHarness.Reading r=new GatewayRadioOperationHarness.Reading(GatewayRadioSettingsTest.report(false,GatewayRadioSettingsTest.RUN,0,5,5,0,"0".repeat(32)),4500,0);SystemClock.now=4999;check(r.fresh());SystemClock.now=5000;check(!r.fresh());}
 static void generationZeroRollback()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.run();GatewayRadioReconcileHarness r=new GatewayRadioReconcileHarness();r.unresolved=new JSONObject(h.lastSaved.toString()).put("beforeGeneration",0);SystemClock.now=100;r.reconcile(new GatewayRadioReconcileHarness.Reading[]{new GatewayRadioReconcileHarness.Reading(GatewayRadioSettingsTest.report(false,GatewayRadioSettingsTest.RUN,0,5,0,0,"0".repeat(32)),100,100),new GatewayRadioReconcileHarness.Reading(GatewayRadioSettingsTest.report(true,GatewayRadioSettingsTest.BRUN,0,5,0,0,"0".repeat(32)),100,100)});check(r.state.equals("rolled-back")&&r.unresolved==null&&r.cleared==1);}
 static void bridgeOutcomeTruth(){count++;GatewayRadioPluginHarness h=new GatewayRadioPluginHarness();PluginCall call=new PluginCall();h.c.mode=1;h.apply(call);check(call.code.equals("RADIO_CHANGE_NOT_ACCEPTED"));call=new PluginCall();h.c.mode=2;h.apply(call);check(call.code.equals("RADIO_CHANGE_OUTCOME_UNKNOWN"));check(!call.message.contains("PRIVATE"));call=new PluginCall();h.c.mode=0;h.apply(call);check(call.resolved);h.visible=false;call=new PluginCall();h.apply(call);check(call.code.equals("RADIO_CHANGE_NOT_ACCEPTED"));}
 static void retainedFreshnessWait()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.stalePolls=3;h.run();check(h.state.equals("applied"));check(h.waits==3&&h.trials==1&&h.commits==1);check(h.staleQueries==0&&h.staleCommands==0&&h.quietClosed==1);}
 static void recoveredProofDuringException()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.recoveredProofGaps=1;h.run();check(h.state.equals("applied"));check(h.trials==1&&h.commits==1&&h.queries==4&&h.quietClosed==1);}
 static void retainedWaitStops()throws Exception{count++;for(int mode=0;mode<5;mode++){GatewayRadioOperationHarness h=setup();h.stalePolls=3;if(mode==0)h.retireAfterTrial=true;if(mode==1)h.proofAlwaysStale=true;if(mode==2)h.cancelDuringWait=true;if(mode==3)h.cohortDuringWait=true;if(mode==4)h.ticketDuringWait=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==0);check(h.staleQueries==0&&h.staleCommands==0);check(h.quietClosed==1&&h.active.get()==null);}}
 static void lateFreshReadback()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.lateTarget=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==0&&h.quietClosed==1);}
 static void journal()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.run();JSONObject marker=h.lastSaved;check(GatewayRadioJournal.checked(marker).getInt("target")==22);for(String key:new String[]{"epoch","target","power","beforeGeneration"}){JSONObject bad=new JSONObject(marker.toString()).put(key,"1");boolean denied=false;try{GatewayRadioJournal.checked(bad);}catch(Exception expected){denied=true;}check(denied);}boolean denied=false;try{GatewayRadioJournal.checked(new JSONObject(marker.toString()).put("unreviewed",true));}catch(Exception expected){denied=true;}check(denied);denied=false;try{GroupNameJson.object(marker.toString()+" junk",4096);}catch(Exception expected){denied=true;}check(denied);}
 static void postCommitRetry()throws Exception{count++;GatewayRadioOperationHarness h=setup();h.loseCommit=true;h.postCommitTimeouts=2;h.run();check(h.state.equals("applied"));check(h.trials==1&&h.commits==1&&h.queries==5);check(h.unresolved==null&&h.quietClosed==1);}
 static void postCommitBoundaries()throws Exception{count++;for(int mode=0;mode<4;mode++){GatewayRadioOperationHarness h=setup();h.loseCommit=true;if(mode==0)h.postCommitTimeouts=99;if(mode==1)h.postCommitWrongBoot=true;if(mode==2)h.cancelAfterCommit=true;if(mode==3)h.lateConfirmation=true;h.run();check(h.state.equals("unknown"));check(h.trials==1&&h.commits==1);check(h.unresolved!=null&&h.quietClosed==1&&h.active.get()==null);if(mode==1||mode==3)check(h.queries==3);if(mode==2)check(h.queries==2);check(h.queries<=14);}}
 static void explicitTrialConsent()throws Exception{
  count++;
  for(int mode=0;mode<5;mode++){
   GatewayRadioOperationHarness h=setup();GatewayRadioOperationHarness.Operation operation=h.active.get();operation.manualCommit=true;
   Thread worker=new Thread(h::run);worker.start();long until=System.nanoTime()+2000000000L;
   while(System.nanoTime()<until&&!h.state.equals("awaiting-commit")){h.sequence.get();Thread.sleep(5);}
   check(h.state.equals("awaiting-commit")&&h.trials==1&&h.commits==0);Thread.sleep(70);check(h.commits==0);
   if(mode==1)SystemClock.now+=30000;
   if(mode==2)operation.cancelled.set(true);
   if(mode==3)h.allowed=false;
   if(mode==4)h.wrongB=true;
   if(mode==0||mode==3||mode==4)operation.commitAuthorized.set(true);
   worker.join(2000);if(worker.isAlive()){operation.cancelled.set(true);worker.interrupt();worker.join();throw new AssertionError("Unbounded explicit radio trial");}
   check(mode==0?h.state.equals("applied")&&h.commits==1&&h.queries==4:h.state.equals("unknown")&&h.commits==0&&h.unresolved!=null);
   check(h.quietClosed==1&&h.active.get()==null);
  }
 }
 public static void main(String[] args)throws Exception{explicitTrialConsent();success();peerTransportBarrier();rebootedRollbackReadback();preflightReadRetries();postCommitRetry();postCommitBoundaries();lostTrialAndCommit();wrongB();stop();unknownCommit();storageBeforeMutation();reassociationRetry();nonceAge();generationZeroRollback();bridgeOutcomeTruth();retainedFreshnessWait();recoveredProofDuringException();retainedWaitStops();lateFreshReadback();journal();System.out.println(new JSONObject().put("status","pass").put("testCount",count).put("assertionCount",assertions));}
}
