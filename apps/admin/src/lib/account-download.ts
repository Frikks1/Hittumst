const extensions=new Set(['jpg','jpeg','png','gif','webp','avif','heic','heif','mp4','mov','m4v','webm','mp3','m4a','aac','wav','ogg','bin']);
export function accountMediaFilename(id:string,path:string){
 const extension=path.split('.').at(-1)?.toLowerCase()??'';
 return `${id}.${extensions.has(extension)?extension:'bin'}`;
}
export function attachmentFilename(header:string|null,fallback:string){
 const name=/^attachment;\s*filename="([a-zA-Z0-9][a-zA-Z0-9._-]{0,159})"(?:;.*)?$/i.exec(header??'')?.[1];
 if(!name||name.includes('..')||!extensions.has(name.split('.').at(-1)?.toLowerCase()??''))return fallback;
 return name;
}
