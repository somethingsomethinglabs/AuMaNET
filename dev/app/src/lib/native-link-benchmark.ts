import {Capacitor,registerPlugin} from '@capacitor/core';
import {LinkBenchmarkClient,type LinkBenchmarkBridge} from './link-benchmark';
export function nativeLinkBenchmark(){return Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETLinkBenchmark')?new LinkBenchmarkClient(registerPlugin<LinkBenchmarkBridge>('AuMaNETLinkBenchmark')):undefined;}
