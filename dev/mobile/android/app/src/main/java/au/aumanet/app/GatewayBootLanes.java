package au.aumanet.app;
import java.util.concurrent.*;

/** Two fixed bounded lanes: stalled B crypto/storage cannot hold A's work queue. */
final class GatewayBootLanes implements AutoCloseable {
    private final ThreadPoolExecutor[] workers=new ThreadPoolExecutor[2];
    GatewayBootLanes(){for(int i=0;i<2;i++){final int lane=i;workers[i]=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(1),task->{Thread thread=new Thread(task,"AuMaNET-gateway-boot-"+lane);thread.setDaemon(true);return thread;});}}
    boolean execute(int lane,Runnable work){if(lane<0||lane>=2||work==null)throw new IllegalArgumentException("Invalid bounded gateway work lane");try{workers[lane].execute(work);return true;}catch(RejectedExecutionException full){return false;}}
    int queued(int lane){return workers[lane].getQueue().size();}int largestPool(int lane){return workers[lane].getLargestPoolSize();}
    public void close(){for(ThreadPoolExecutor worker:workers)worker.shutdownNow();}
}
