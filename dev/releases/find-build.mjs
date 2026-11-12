import {lstatSync,readdirSync,realpathSync,appendFileSync} from 'node:fs';
import {resolve,join,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Discover only an actual role-specific SDK output, never a path from metadata. */
export function findBuild(root,role){
 if(!['A','B'].includes(role))throw Error('Expected build role A or B');
 root=resolve(root);if(lstatSync(root).isSymbolicLink())throw Error('Repository root cannot be a symlink');
 let path=root;for(const part of ['dev','artifacts']){path=join(path,part);const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Expected a real artifact directory');}
 const pattern=new RegExp(`^firmware-${role}-gateway-v[0-9]+-generic$`);
 const matches=readdirSync(path).filter(name=>pattern.test(name));if(matches.length!==1)throw Error('Expected exactly one role-specific generic build directory');
 const directory=join(path,matches[0]),stat=lstatSync(directory);if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(directory)!==directory)throw Error('Generic build directory cannot be redirected');
 for(const name of ['aumanet_bench.bin','build-info.json']){const file=join(directory,name),entry=lstatSync(file);if(entry.isSymbolicLink()||!entry.isFile()||entry.size<1||realpathSync(file)!==file)throw Error('Expected a real nonempty build output file');}
 const output=relative(root,directory).split(sep).join('/');if(!/^dev\/artifacts\/firmware-[AB]-gateway-v[0-9]+-generic$/.test(output))throw Error('Unexpected build output path');
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==4||process.argv[2]!=='--role')throw Error('Use --role A|B');const directory=findBuild(process.cwd(),process.argv[3]);if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`directory=${directory}\n`);console.log(JSON.stringify({directory}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
