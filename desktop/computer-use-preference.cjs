const fs=require('node:fs');const path=require('node:path');
class ComputerUsePreference{
 constructor(file){this.file=file;}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8')).enabled===true;}catch{return false;}}
 set(enabled){if(typeof enabled!=='boolean')throw Error('Invalid computer use preference.');fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';fs.writeFileSync(temporary,JSON.stringify({enabled}),{mode:0o600});fs.renameSync(temporary,this.file);return enabled;}
}
module.exports={ComputerUsePreference};
