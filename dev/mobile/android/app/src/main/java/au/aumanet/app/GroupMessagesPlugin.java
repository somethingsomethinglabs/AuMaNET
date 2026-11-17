package au.aumanet.app;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.lifecycle.Lifecycle;
import org.json.*;

/** Normal native durable text API. Loading, polling and lookup never transmit. */
@CapacitorPlugin(name="AuMaNETGroupMessages")
public final class GroupMessagesPlugin extends Plugin {
    private interface Operation{JSONObject run(GroupMessages messages,GroupTextStore.Scope scope)throws Exception;}
    private static String text(PluginCall call,String key)throws Exception{return GroupTextWire.string(call.getData(),key);}
    private static long number(PluginCall call,String key)throws Exception{return GroupTextWire.integer(call.getData(),key);}
    private void execute(PluginCall call,boolean mutation,boolean foreground,Operation operation){execute(call,mutation,foreground,false,operation);}
    private void execute(PluginCall call,boolean mutation,boolean foreground,boolean newSend,Operation operation){execute(call,mutation,foreground,newSend,true,operation);}
    private void execute(PluginCall call,boolean mutation,boolean foreground,boolean newSend,boolean rearm,Operation operation){
        try{if(foreground&&!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new IllegalStateException("Open the app before sending a group message");GroupMessages messages=GroupSession.get(getContext()).messages();GroupTextStore.Scope scope=mutation?messages.capture(text(call,"groupId"),text(call,"selfId")):null;
            GroupMessageIntent.Run intent=foreground?(rearm?messages.beginForeground():messages.retainForeground()):null;messages.submit(()->operation.run(messages,scope),new GroupMessages.Reply(){public void resolve(JSONObject value){JSObject result=new JSObject();java.util.Iterator<String> keys=value.keys();while(keys.hasNext()){String key=keys.next();result.put(key,value.opt(key));}if("aumanet.group-messages.v1".equals(value.optString("schema")))result.put("imageSaveAvailable",GroupImageExportAndroid.available());call.resolve(result);}public void reject(Exception error){String reason=GroupTextErrors.message(error);call.reject(reason,error instanceof GroupTextStore.NotAccepted?"GROUP_MESSAGE_NOT_ACCEPTED":error instanceof GroupTextStore.RevisionConflict?"STORE_REVISION_CONFLICT":"GROUP_MESSAGE_OPERATION_FAILED");}},intent);
        }catch(Exception failure){call.reject(GroupTextErrors.message(failure),newSend?"GROUP_MESSAGE_NOT_ACCEPTED":"GROUP_MESSAGE_OPERATION_FAILED");}
    }
    @PluginMethod public void snapshot(PluginCall call){execute(call,false,false,(messages,scope)->messages.snapshot());}
    @PluginMethod public void saveDraft(PluginCall call){execute(call,true,false,(messages,scope)->messages.saveDraft(scope,number(call,"expectedRevision"),text(call,"draft")));}
    @PluginMethod public void send(PluginCall call){execute(call,true,true,true,(messages,scope)->{
        long revision,epoch;String id;try{revision=number(call,"expectedRevision");epoch=number(call,"expectedEpoch");id=text(call,"id");}catch(Exception before){throw new GroupTextStore.NotAccepted(before);}return messages.send(scope,revision,epoch,id);
    });}
    @PluginMethod public void retry(PluginCall call){execute(call,true,true,(messages,scope)->messages.retry(scope,number(call,"expectedRevision"),number(call,"expectedEpoch"),text(call,"id")));}
    @PluginMethod public void cancel(PluginCall call){execute(call,true,false,(messages,scope)->messages.cancel(scope,number(call,"expectedRevision"),text(call,"id")));}
    @PluginMethod public void clearHistory(PluginCall call){execute(call,true,false,(messages,scope)->messages.clearHistory(scope,number(call,"expectedRevision"),text(call,"confirmation")));}
    @PluginMethod public void lookup(PluginCall call){execute(call,true,false,(messages,scope)->messages.lookup(scope,text(call,"id")));}
    @PluginMethod public void resumeDelivery(PluginCall call){execute(call,true,true,(messages,scope)->messages.resumeDelivery(scope,number(call,"expectedRevision"),number(call,"expectedEpoch")));}
    @PluginMethod public void sendImage(PluginCall call){execute(call,true,true,true,(messages,scope)->messages.sendImage(scope,number(call,"expectedRevision"),number(call,"expectedEpoch"),text(call,"id"),call.getData()));}
    @PluginMethod public void fetchImage(PluginCall call){execute(call,true,true,false,false,(messages,scope)->messages.fetchImage(scope,number(call,"expectedRevision"),number(call,"expectedEpoch"),text(call,"senderId"),text(call,"id")));}
    @PluginMethod public void readImage(PluginCall call){execute(call,true,false,(messages,scope)->messages.readImage(scope,text(call,"senderId"),text(call,"id")));}
    /** Explicit local export must not use foreground execute(), which would re-arm message delivery. */
    @PluginMethod public void saveImage(PluginCall call){
        try{
            if(!GroupImageExportAndroid.available()||!"save-image-to-pictures".equals(text(call,"acknowledgement"))||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new GroupImageExport.SaveException(false);
            String sender=text(call,"senderId"),id=text(call,"id"),process=text(call,"expectedProcessId"),sha=text(call,"sha256");GroupMessages messages=GroupSession.get(getContext()).messages();GroupTextStore.Scope scope=messages.capture(text(call,"groupId"),text(call,"selfId"));GroupImageExportAndroid store=new GroupImageExportAndroid(getContext());
            messages.submit(()->{try{GroupImageExport.Source local=messages.prepareImageExport(scope,sender,id,process,sha);GroupImageExport.submit(local,store,new GroupImageExport.Reply(){public void saved(JSONObject value){JSObject result=new JSObject();java.util.Iterator<String> keys=value.keys();while(keys.hasNext()){String key=keys.next();result.put(key,value.opt(key));}call.resolve(result);}public void failed(GroupImageExport.SaveException failure){rejectImageSave(call,failure.uncertain);}});}catch(Exception unavailable){rejectImageSave(call,false);}return new JSONObject();},new GroupMessages.Reply(){public void resolve(JSONObject ignored){}public void reject(Exception failed){rejectImageSave(call,false);}});
        }catch(Exception failed){rejectImageSave(call,false);}
    }
    private static void rejectImageSave(PluginCall call,boolean uncertain){call.reject(uncertain?GroupImageExport.UNCONFIRMED:GroupImageExport.FAILED,uncertain?"GROUP_IMAGE_SAVE_UNCONFIRMED":"GROUP_IMAGE_SAVE_FAILED");}
    @PluginMethod public void cancelImageTransfer(PluginCall call){execute(call,true,false,(messages,scope)->messages.cancelImageTransfer(scope,number(call,"expectedRevision"),number(call,"expectedEpoch"),text(call,"senderId"),text(call,"id")));}
    @PluginMethod public void configureHistory(PluginCall call){execute(call,true,false,(messages,scope)->{Object shared=call.getData().get("shareWithNewMembers");if(!(shared instanceof Boolean))throw new IllegalArgumentException("Choose a history sharing setting");return messages.configureHistory(scope,number(call,"expectedRevision"),number(call,"expectedEpoch"),(Boolean)shared,text(call,"acknowledgement"));});}
}
