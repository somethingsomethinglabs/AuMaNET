type Task<T>={read:()=>Promise<T>;cancelled:()=>boolean;resolve:(value:T|undefined)=>void;reject:(error:unknown)=>void};
/** Limits materialized browser tile reads independently of map/archive size. */
export class TileReadQueue {
  private active=0;
  private queue:Array<Task<unknown>>=[];
  private concurrency:number;
  private capacity:number;
  constructor(concurrency=4,capacity=1024){if(!Number.isInteger(concurrency)||concurrency<1||!Number.isInteger(capacity)||capacity<1)throw new Error('Invalid tile read limits');this.concurrency=concurrency;this.capacity=capacity;}
  get state(){return{active:this.active,queued:this.queue.length};}
  read<T>(read:()=>Promise<T>,cancelled:()=>boolean):Promise<T|undefined>{
    if(cancelled())return Promise.resolve(undefined);
    this.queue=this.queue.filter(task=>{if(task.cancelled()){task.resolve(undefined);return false;}return true;});
    if(this.queue.length>=this.capacity)return Promise.reject(new Error('Offline tile read queue is full; wait for the map to settle.'));
    return new Promise<T|undefined>((resolve,reject)=>{this.queue.push({read,cancelled,resolve:resolve as(value:unknown)=>void,reject});this.pump();});
  }
  private pump(){while(this.active<this.concurrency&&this.queue.length){const task=this.queue.shift()!;if(task.cancelled()){task.resolve(undefined);continue;}this.active++;void Promise.resolve().then(task.read).then(value=>task.resolve(task.cancelled()?undefined:value),task.reject).finally(()=>{this.active--;this.pump();});}}
}
export const offlineTileReads=new TileReadQueue();
