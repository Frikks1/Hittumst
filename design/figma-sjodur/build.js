// Native local Figma editor. All data below is explicitly marked as an example.
const SECTION_NAME='06 · Sjóður og styrktaraðilar';
const created=[],mutated=[],pendingStyles=[],customSizes=[];let applying=false,exporting=false,sourceAck=null;
const record=n=>{created.push(n.id);return n;};
figma.showUI(`<html><body style="font:13px sans-serif;padding:16px;color:#182b24"><h2>Sjóður og styrktaraðilar</h2><p>Three event cards, expandable sponsor details, recurring recognition and priority attendance. Sample data is marked Dæmi.</p><button id="apply" style="padding:8px">Apply design</button><button id="focus" style="padding:8px">Focus closed screen</button><button id="audit" style="padding:8px">Verify design</button><button id="done" style="padding:8px">Close</button><hr><button id="exportSource" style="padding:8px">Export source (read only)</button> <a id="saveSource" hidden>Save source JSON</a><p id="exportStatus" role="status">Exports the current Screens page, original images, vector SVGs and screen references. Does not change the design.</p><textarea id="result" readonly style="width:100%;height:210px;margin-top:12px"></textarea><script>
const controls=['apply','focus','audit','exportSource'].map(id=>document.getElementById(id));
const result=document.getElementById('result'),exportStatus=document.getElementById('exportStatus'),saveSource=document.getElementById('saveSource');
let transfer=null,downloadURL=null;
const send=message=>parent.postMessage({pluginMessage:message},'*');
const busy=value=>controls.forEach(control=>{control.disabled=value});
document.getElementById('apply').onclick=()=>{busy(true);send({type:'apply'})};
document.getElementById('focus').onclick=()=>send({type:'focus'});
document.getElementById('audit').onclick=()=>send({type:'audit'});
document.getElementById('done').onclick=()=>send({type:'close'});
document.getElementById('exportSource').onclick=()=>{busy(true);saveSource.hidden=true;exportStatus.textContent='Reading source… Keep this page open until export finishes.';send({type:'export-source'})};
onmessage=e=>{
 const message=e.data.pluginMessage;if(!message)return;
 if(message.type==='report'){result.value=JSON.stringify(message.value,null,2);busy(false)}
 if(message.type==='source-progress')exportStatus.textContent=message.message;
 if(message.type==='source-begin')transfer={id:message.id,filename:message.filename,length:message.length,chunks:[],received:0};
 if(message.type==='source-chunk'){
  if(!transfer||message.id!==transfer.id||message.index!==transfer.chunks.length||typeof message.text!=='string'){send({type:'source-ack',id:message.id,index:message.index,error:'Unexpected export chunk'});return}
  transfer.chunks.push(message.text);transfer.received+=message.text.length;send({type:'source-ack',id:message.id,index:message.index});
 }
 if(message.type==='source-ready'){
  try{
   if(!transfer||message.id!==transfer.id||transfer.received!==transfer.length)throw new Error('The export was interrupted; run Export source again.');
   const blob=new Blob(transfer.chunks,{type:'application/json'});
   if(downloadURL)URL.revokeObjectURL(downloadURL);
   downloadURL=URL.createObjectURL(blob);saveSource.href=downloadURL;saveSource.download=transfer.filename;saveSource.hidden=false;
   exportStatus.textContent=(message.complete?'Source ready.':'Source ready with incomplete items; review warnings.')+' Click Save source JSON ('+(blob.size/1048576).toFixed(1)+' MB).';
   result.value=JSON.stringify({complete:message.complete,file:message.file,stats:message.stats,warnings:message.warnings},null,2);
   transfer=null;busy(false);send({type:'source-ack',id:message.id,index:'ready'});
  }catch(error){transfer=null;busy(false);saveSource.hidden=true;exportStatus.textContent=String(error.message||error);send({type:'source-ack',id:message.id,index:'ready',error:String(error.message||error)})}
 }
 if(message.type==='source-error'){transfer=null;busy(false);saveSource.hidden=true;exportStatus.textContent=message.error;result.value=JSON.stringify({success:false,error:message.error},null,2)}
};
</script></body></html>`,{width:620,height:580});

// SOURCE_EXPORT_BEGIN: this path reads native properties and exports bytes only.
const SOURCE_FILE_KEY='zFMhaTVnbO70o1soPjNmhL',SOURCE_PAGE_ID='0:1';
const SOURCE_LIMITS={assetBytes:32*1024*1024,totalAssetBytes:128*1024*1024,jsonCharacters:256*1024*1024,chunkCharacters:256*1024,referencePixels:64*1024*1024};
const SOURCE_NODE_FIELDS=(
 'id type name removed visible locked x y width height rotation relativeTransform absoluteTransform absoluteBoundingBox absoluteRenderBounds '+
 'opacity blendMode isMask maskType effects effectStyleId fills fillStyleId strokes strokeStyleId strokeWeight strokeAlign strokeCap strokeJoin strokeMiterLimit dashPattern '+
 'strokeTopWeight strokeRightWeight strokeBottomWeight strokeLeftWeight strokesIncludedInLayout cornerRadius cornerSmoothing topLeftRadius topRightRadius bottomLeftRadius bottomRightRadius '+
 'layoutMode layoutWrap primaryAxisAlignItems counterAxisAlignItems counterAxisAlignContent primaryAxisSizingMode counterAxisSizingMode itemSpacing counterAxisSpacing '+
 'paddingTop paddingRight paddingBottom paddingLeft itemReverseZIndex layoutAlign layoutGrow layoutPositioning layoutSizingHorizontal layoutSizingVertical minWidth maxWidth minHeight maxHeight '+
 'constraints constrainProportions targetAspectRatio clipsContent layoutGrids gridStyleId gridRowCount gridColumnCount gridRowGap gridColumnGap gridRowSizes gridColumnSizes gridAutoTracks '+
 'gridItemsPositioning gridColumnSpan gridRowSpan gridRowAnchorIndex gridColumnAnchorIndex gridChildHorizontalAlign gridChildVerticalAlign '+
 'boundVariables resolvedVariableModes explicitVariableModes componentPropertyReferences componentProperties variantProperties overrides exposedInstances isExposedInstance detachedInfo '+
 'characters fontName fontSize fontWeight fontStyle textCase textDecoration textDecorationStyle textDecorationOffset textDecorationThickness textDecorationColor textDecorationSkipInk '+
 'textAlignHorizontal textAlignVertical textAutoResize textTruncation maxLines lineHeight letterSpacing paragraphIndent paragraphSpacing listSpacing textWrapStyle hangingPunctuation hangingList '+
 'hyperlink openTypeFeatures textStyleId hasMissingFont leadingTrim autoRename '+
 'booleanOperation vectorPaths vectorNetwork fillGeometry strokeGeometry handleMirroring arcData pointCount innerRadius '+
 'reactions overflowDirection numberOfFixedChildren overlayPositionType overlayBackground overlayBackgroundInteraction transitionNodeID transitionDuration transitionEasing '+
 'exportSettings backgrounds backgroundStyleId guides flowStartingPoints prototypeStartNode description descriptionMarkdown documentationLinks key isAsset devStatus'
).trim().split(/\s+/);
const SOURCE_STYLE_FIELDS=('id type name key remote description descriptionMarkdown documentationLinks paints effects layoutGrids boundVariables fontName fontSize textDecoration letterSpacing lineHeight leadingTrim paragraphIndent paragraphSpacing textWrapStyle listSpacing hangingPunctuation hangingList textCase').split(' ');
const SOURCE_VARIABLE_FIELDS=('id name key remote description resolvedType valuesByMode scopes codeSyntax hiddenFromPublishing variableCollectionId').split(' ');
const SOURCE_COLLECTION_FIELDS=('id name key remote modes variableIds defaultModeId hiddenFromPublishing').split(' ');
// Range fields listed by Figma's current getStyledTextSegments documentation.
// textWrapStyle is read through its documented getRange method below.
const SOURCE_TEXT_FIELDS=('fontName fontSize fontWeight textCase textDecoration lineHeight letterSpacing fills textStyleId fillStyleId listOptions listSpacing indentation paragraphIndent paragraphSpacing hyperlink openTypeFeatures boundVariables textStyleOverrides').split(' ');
const SOURCE_VECTOR_TYPES=new Set(['VECTOR','BOOLEAN_OPERATION','LINE','ELLIPSE','POLYGON','STAR']);
const SOURCE_SCREEN_TYPES=new Set(['FRAME','COMPONENT','INSTANCE','COMPONENT_SET']);
function sourceBase64(bytes){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',parts=[];
 for(let offset=0;offset<bytes.length;offset+=12288){
  let part='';const end=Math.min(offset+12288,bytes.length);
  for(let index=offset;index<end;index+=3){
   const a=bytes[index],hasB=index+1<bytes.length,hasC=index+2<bytes.length,b=hasB?bytes[index+1]:0,c=hasC?bytes[index+2]:0;
   part+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(hasB?alphabet[((b&15)<<2)|(c>>6)]:'=')+(hasC?alphabet[c&63]:'=');
  }
  parts.push(part);
 }
 return parts.join('');
}
function sourceImageFormat(bytes){
 if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return {mimeType:'image/png',extension:'png'};
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mimeType:'image/jpeg',extension:'jpg'};
 const ascii=(start,length)=>String.fromCharCode(...bytes.slice(start,start+length));
 if(bytes.length>=6&&(ascii(0,6)==='GIF87a'||ascii(0,6)==='GIF89a'))return {mimeType:'image/gif',extension:'gif'};
 if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')return {mimeType:'image/webp',extension:'webp'};
 return {mimeType:'application/octet-stream',extension:'bin'};
}
function sourceSafeId(value){return String(value).replace(/[^A-Za-z0-9_-]/g,'_')||'unknown';}
function sourceContext(){
 const warnings=[],assets=[],requiredAssets=[],failedAssets=[],imageHashes=new Set(),styleIds=new Set(),variableIds=new Set(),fonts=new Map();
 const context={warnings,assets,requiredAssets,failedAssets,imageHashes,styleIds,variableIds,fonts,complete:true,stats:{nodes:0,images:0,references:0,vectors:0,assetBytes:0,warnings:0}};
 context.warn=(scope,message,id,property,incomplete=true)=>{const warning={scope,message};if(id)warning.id=id;if(property)warning.property=property;warnings.push(warning);if(incomplete)context.complete=false};
 return context;
}
function sourceClone(value,context,scope,id,property,ancestors=new Set(),depth=0){
 if(value===figma.mixed)return {$figma:'mixed'};
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(Number.isFinite(value))return value;context.warn(scope,'Non-finite numeric value',id,property);return {$figma:'non-finite',value:String(value)}}
 if(value===undefined)return undefined;
 if(typeof value!=='object'){context.warn(scope,'Unsupported value: '+typeof value,id,property);return {$figma:'unsupported',type:typeof value}}
 if(depth>100||ancestors.has(value)){context.warn(scope,'Cyclic or excessively deep value',id,property);return {$figma:'unserializable'}}
 const next=new Set(ancestors);next.add(value);
 try{
  if('parent' in value&&'removed' in value&&typeof value.id==='string'&&typeof value.type==='string')return {$figma:'node-reference',id:value.id,type:value.type,name:value.name};
  if(Array.isArray(value))return value.map((item,index)=>sourceClone(item,context,scope,id,property+'.'+index,next,depth+1));
  // Figma returns immutable, structured property objects. Read their own data,
  // not live node getters/prototypes; preserve getter failures explicitly.
  const result={};
  for(const key of Object.keys(value)){
   try{const item=sourceClone(value[key],context,scope,id,property+'.'+key,next,depth+1);if(item!==undefined)Object.defineProperty(result,key,{value:item,enumerable:true,writable:true,configurable:true})}
   catch(error){context.warn(scope,String(error.message||error),id,property+'.'+key);Object.defineProperty(result,key,{value:{$figma:'unreadable'},enumerable:true})}
  }
  return result;
 }catch(error){context.warn(scope,String(error.message||error),id,property);return {$figma:'unreadable'}}
}
function sourceProperties(object,fields,context,scope,id){
 const result={};
 for(const property of fields){
  try{if(property in object){const value=sourceClone(object[property],context,scope,id,property);if(value!==undefined)result[property]=value}}
  catch(error){context.warn(scope,String(error.message||error),id,property);result[property]={$figma:'unreadable'}}
 }
 return result;
}
function sourceCollect(value,context,key=''){
 if(!value||typeof value!=='object')return;
 if(value.type==='IMAGE'){
  if(typeof value.imageHash==='string'&&value.imageHash)context.imageHashes.add(value.imageHash);
  else if(value.visible!==false)context.warn('image','Image paint has no image hash',undefined,'imageHash');
 }
 if(value.type==='VIDEO'||value.type==='PATTERN')context.warn('asset','This paint type has no original-byte exporter in this plugin: '+value.type,undefined,key);
 if(value.type==='VARIABLE_ALIAS'&&typeof value.id==='string')context.variableIds.add(value.id);
 if(typeof value.family==='string'&&typeof value.style==='string')context.fonts.set(JSON.stringify(value),value);
 for(const property of Object.keys(value)){
  if(/StyleId$/.test(property)&&typeof value[property]==='string'&&value[property])context.styleIds.add(value[property]);
  sourceCollect(value[property],context,property);
 }
}
function sourceTextSegments(node,context){
 const fields=SOURCE_TEXT_FIELDS.concat(['fontStyle','textDecorationStyle','textDecorationOffset','textDecorationThickness','textDecorationColor','textDecorationSkipInk'].filter(field=>field in node));
 const addWrap=segments=>{
  if(typeof node.getRangeTextWrapStyle==='function')for(const segment of segments){
   try{segment.textWrapStyle=sourceClone(node.getRangeTextWrapStyle(segment.start,segment.end),context,'text',node.id,'textWrapStyle')}
   catch(error){context.warn('text',String(error.message||error),node.id,'textWrapStyle')}
  }
  return segments;
 };
 try{return addWrap(sourceClone(node.getStyledTextSegments(fields),context,'text',node.id,'styledTextSegments'))}
 catch(error){
  context.warn('text','Full text segment read failed; recovering each property: '+String(error.message||error),node.id,'styledTextSegments');
  const byField=[],boundaries=new Set([0,node.characters.length]);
  for(const field of fields){
   try{const segments=node.getStyledTextSegments([field]);byField.push({field,segments});for(const segment of segments){boundaries.add(segment.start);boundaries.add(segment.end)}}
   catch(fieldError){context.warn('text',String(fieldError.message||fieldError),node.id,field)}
  }
  const sorted=[...boundaries].sort((a,b)=>a-b),segments=[];
  for(let index=0;index+1<sorted.length;index++){
   const start=sorted[index],end=sorted[index+1];if(end<=start)continue;
   const segment={start,end,characters:node.characters.slice(start,end)};
   for(const {field,segments:values} of byField){const match=values.find(value=>value.start<=start&&value.end>=end);if(match)segment[field]=sourceClone(match[field],context,'text',node.id,field)}
   segments.push(segment);
  }
  return addWrap(segments);
 }
}
async function sourceNode(node,parentId,parentVisible,ancestorScreen,ancestorBoolean,context,references,vectors){
 const result=sourceProperties(node,SOURCE_NODE_FIELDS,context,'node',node.id);
 result.parentId=parentId;result.effectiveVisible=parentVisible&&result.visible!==false;
 context.stats.nodes++;
 if('characters' in node&&typeof node.getStyledTextSegments==='function')result.styledTextSegments=sourceTextSegments(node,context);
 if(node.type==='COMPONENT_SET'||(node.type==='COMPONENT'&&(!node.parent||node.parent.type!=='COMPONENT_SET'))){
  const definition=sourceProperties(node,['componentPropertyDefinitions'],context,'component',node.id);Object.assign(result,definition);
 }
 if(node.type==='INSTANCE'){
  try{const component=await node.getMainComponentAsync();result.mainComponent=component?sourceProperties(component,['id','type','name','key','remote'],context,'component',node.id):null}
  catch(error){context.warn('component',String(error.message||error),node.id,'mainComponent');result.mainComponent={$figma:'unreadable'}}
 }
 sourceCollect(result,context);
 const screen=SOURCE_SCREEN_TYPES.has(node.type);
 if(result.effectiveVisible&&screen&&!ancestorScreen)references.push(node);
 if(result.effectiveVisible&&SOURCE_VECTOR_TYPES.has(node.type)&&!ancestorBoolean)vectors.push(node);
 if('children' in node){
  result.children=[];
  try{for(const child of [...node.children])result.children.push(await sourceNode(child,node.id,result.effectiveVisible,ancestorScreen||screen,ancestorBoolean||node.type==='BOOLEAN_OPERATION',context,references,vectors))}
  catch(error){context.warn('children',String(error.message||error),node.id,'children')}
 }
 if(context.stats.nodes%100===0)figma.ui.postMessage({type:'source-progress',message:'Reading native hierarchy: '+context.stats.nodes+' nodes…'});
 return result;
}
async function sourceResources(context){
 const resources={styles:[],variables:[],collections:[],fonts:[]};
 const styles=new Map(),variables=new Map(),collections=new Map();
 for(const method of ['getLocalPaintStylesAsync','getLocalTextStylesAsync','getLocalEffectStylesAsync','getLocalGridStylesAsync']){
  try{for(const style of await figma[method]())styles.set(style.id,style)}catch(error){context.warn('styles',String(error.message||error),undefined,method)}
 }
 for(const [id,style] of styles){const item=sourceProperties(style,SOURCE_STYLE_FIELDS,context,'style',id);resources.styles.push(item);sourceCollect(item,context)}
 for(const id of context.styleIds){
  if(styles.has(id))continue;
  try{const style=await figma.getStyleByIdAsync(id);if(!style)throw new Error('Referenced style is missing');styles.set(id,style);const item=sourceProperties(style,SOURCE_STYLE_FIELDS,context,'style',id);resources.styles.push(item);sourceCollect(item,context)}
  catch(error){context.warn('style',String(error.message||error),id)}
 }
 try{for(const variable of await figma.variables.getLocalVariablesAsync())variables.set(variable.id,variable)}catch(error){context.warn('variables',String(error.message||error))}
 try{for(const collection of await figma.variables.getLocalVariableCollectionsAsync())collections.set(collection.id,collection)}catch(error){context.warn('collections',String(error.message||error))}
 // A Set iterator includes aliases found while reading earlier variables.
 for(const variable of variables.values())context.variableIds.add(variable.id);
 for(const id of context.variableIds){
  try{
   const variable=variables.get(id)||await figma.variables.getVariableByIdAsync(id);if(!variable)throw new Error('Referenced variable is missing');
   variables.set(id,variable);const item=sourceProperties(variable,SOURCE_VARIABLE_FIELDS,context,'variable',id);resources.variables.push(item);sourceCollect(item,context);
   if(item.variableCollectionId&&!collections.has(item.variableCollectionId)){const collection=await figma.variables.getVariableCollectionByIdAsync(item.variableCollectionId);if(!collection)throw new Error('Referenced variable collection is missing');collections.set(collection.id,collection)}
  }catch(error){context.warn('variable',String(error.message||error),id)}
 }
 for(const [id,collection] of collections)resources.collections.push(sourceProperties(collection,SOURCE_COLLECTION_FIELDS,context,'collection',id));
 resources.fonts=[...context.fonts.values()];return resources;
}
function sourceAsset(bytes,metadata,context){
 if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('No binary bytes returned');
 if(bytes.length>SOURCE_LIMITS.assetBytes)throw new Error('Asset exceeds 32 MiB limit');
 if(context.stats.assetBytes+bytes.length>SOURCE_LIMITS.totalAssetBytes)throw new Error('Assets exceed 128 MiB total limit');
 context.assets.push(Object.assign({},metadata,{byteLength:bytes.length,dataBase64:sourceBase64(bytes)}));
 context.stats.assetBytes+=bytes.length;context.stats[metadata.kind==='image'?'images':metadata.kind==='reference'?'references':'vectors']++;
}
async function sourceAssets(context,references,vectors){
 const tasks=[...[...context.imageHashes].map(imageHash=>({kind:'image',imageHash})),...references.map(node=>({kind:'reference',node})),...vectors.map(node=>({kind:'vector',node}))];
 for(const task of tasks){
  task.required={kind:task.kind,path:task.kind==='image'?'images/'+sourceSafeId(task.imageHash)+'.bin':(task.kind==='reference'?'references/':'vectors/')+sourceSafeId(task.node.id)+(task.kind==='reference'?'.png':'.svg')};
  if(task.node)task.required.nodeId=task.node.id;else task.required.imageHash=task.imageHash;
  context.requiredAssets.push(task.required);
 }
 for(let index=0;index<tasks.length;index++){
  const task=tasks[index],id=task.node?task.node.id:task.imageHash;
  figma.ui.postMessage({type:'source-progress',message:'Exporting native assets '+(index+1)+' / '+tasks.length+' ('+task.kind+')…'});
  try{
   if(task.kind==='image'){
    const image=figma.getImageByHash(task.imageHash);if(!image)throw new Error('Image hash could not be resolved');
    const bytes=await image.getBytesAsync(),format=sourceImageFormat(bytes),size=await image.getSizeAsync();
    task.required.path='images/'+sourceSafeId(task.imageHash)+'.'+format.extension;
    sourceAsset(bytes,{...task.required,mimeType:format.mimeType,width:size.width,height:size.height},context);
    if(format.extension==='bin'){
     const message='Unrecognized image container; original bytes are preserved but need verification before use.';
     context.failedAssets.push({...task.required,message});context.warn('image',message,task.imageHash);
    }
   }else{
    const node=task.node;
    if(task.kind==='reference'&&node.width*node.height>SOURCE_LIMITS.referencePixels)throw new Error('Reference exceeds 64 megapixel limit; dimensions were not changed');
    const settings=task.kind==='reference'?{format:'PNG',constraint:{type:'SCALE',value:1},contentsOnly:true,useAbsoluteBounds:true}:{format:'SVG',svgOutlineText:true,svgIdAttribute:true,svgSimplifyStroke:false,contentsOnly:true};
    const bytes=await node.exportAsync(settings);
    sourceAsset(bytes,{...task.required,mimeType:task.kind==='reference'?'image/png':'image/svg+xml',width:node.width,height:node.height,settings},context);
   }
  }catch(error){const message=String(error.message||error);context.failedAssets.push({...task.required,message});context.warn('asset',message,id,task.kind)}
 }
}
async function exportSource(){
 const context=sourceContext();
 if(figma.editorType!=='figma')throw new Error('Open the Figma Design file before exporting.');
 const key=typeof figma.fileKey==='string'&&figma.fileKey?figma.fileKey:null;
 if(key&&key!==SOURCE_FILE_KEY)throw new Error('Wrong Figma file. Open Hittingar — Events Discovery Redesign (zFMhaTVnbO70o1soPjNmhL).');
 const page=figma.currentPage;
 if(page.id!==SOURCE_PAGE_ID||page.name!=='Screens')throw new Error('Wrong page. Open the Screens page (0:1) before exporting.');
 if(!key)context.warn('identity','Figma does not expose this file key to a regular local plugin. Confirm the open file URL matches expectedKey before using this source.',undefined,undefined,false);
 await page.loadAsync();
 const previousSkip=figma.skipInvisibleInstanceChildren;
 const references=[],vectors=[];
 let nativePage;
 try{
  // This is a plugin traversal option, never a node property or canvas edit.
  figma.skipInvisibleInstanceChildren=false;
  nativePage=await sourceNode(page,figma.root.id,true,false,false,context,references,vectors);
  const resources=await sourceResources(context);
  await sourceAssets(context,references,vectors);
  if(figma.currentPage.id!==page.id)context.warn('identity','The current page changed during export. Re-export with Screens open.');
  context.stats.warnings=context.warnings.length;
  return {format:'hittingar-figma-source',version:1,exportedAt:new Date().toISOString(),file:{key,name:figma.root.name,expectedKey:SOURCE_FILE_KEY,verified:key===SOURCE_FILE_KEY},page:nativePage,resources,assets:context.assets,requiredAssets:context.requiredAssets,failedAssets:context.failedAssets,warnings:context.warnings,stats:context.stats,complete:context.complete,limits:SOURCE_LIMITS};
 }finally{figma.skipInvisibleInstanceChildren=previousSkip}
}
function sourcePostAndWait(message,id,index){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{sourceAck=null;reject(new Error('Export download UI did not respond. Reopen the plugin and try again.'))},20000);
  sourceAck={id,index,settle:error=>{clearTimeout(timer);sourceAck=null;error?reject(new Error(error)):resolve()}};
  try{figma.ui.postMessage(message)}catch(error){sourceAck.settle(String(error.message||error))}
 });
}
async function sourceDownload(source){
 const json=JSON.stringify(source);
 if(json.length>SOURCE_LIMITS.jsonCharacters)throw new Error('Source JSON exceeds 256 MiB of characters. No truncated export was offered.');
 const id='source-'+Date.now(),filename='hittingar-figma-source-'+source.exportedAt.replace(/[:.]/g,'-')+'.json';
 figma.ui.postMessage({type:'source-begin',id,filename,length:json.length});
 for(let offset=0,index=0;offset<json.length;index++){
  let end=Math.min(offset+SOURCE_LIMITS.chunkCharacters,json.length);
  // Blob UTF-8 encodes each chunk separately. Never split a surrogate pair.
  if(end<json.length&&json.charCodeAt(end-1)>=0xD800&&json.charCodeAt(end-1)<=0xDBFF&&json.charCodeAt(end)>=0xDC00&&json.charCodeAt(end)<=0xDFFF)end++;
  await sourcePostAndWait({type:'source-chunk',id,index,text:json.slice(offset,end)},id,index);offset=end;
 }
 await sourcePostAndWait({type:'source-ready',id,complete:source.complete,file:source.file,stats:source.stats,warnings:source.warnings},id,'ready');
}
// SOURCE_EXPORT_END
async function build(){
 await figma.currentPage.loadAsync();
 const partial=await figma.getNodeByIdAsync('53:14');
 if(partial&&partial.type==='SECTION'&&partial.name===SECTION_NAME&&partial.children.length===1&&partial.children[0].id==='53:15')partial.remove();
 const existing=figma.currentPage.children.find(n=>n.name===SECTION_NAME);
 if(existing){
  const widths={'Name and current contribution':330,'Attendance / Sponsor priority':354,'Sjóður and close':354,'Total and example label':322,'Sponsor list disclosure / Open':354,'Attendance header':354,'Close sponsors':32,'Sjóður · show sponsors':228};
  const targets=existing.findAll(n=>(n.type==='FRAME'||n.type==='COMPONENT')&&widths[n.name]);
  for(const id of ['53:176','53:182','53:188']){const n=await figma.getNodeByIdAsync(id);if(n&&n.name==='Sjóður · show sponsors')targets.push(n);}
  for(const n of targets){n.resize(widths[n.name],Math.max(1,n.height));n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';mutated.push(n.id);}
  const panels=await Promise.all(['53:30','53:87','53:124'].map(id=>figma.getNodeByIdAsync(id)));
  const overview=await figma.getNodeByIdAsync('53:193');figma.currentPage.selection=[overview,panels[0]];figma.viewport.scrollAndZoomIntoView([overview,panels[0]]);
  return {success:true,repaired:true,sectionId:existing.id,overviewId:overview.id,panels:panels.map(p=>({id:p.id,width:p.width,height:p.height})),mutatedNodeIds:mutated};
 }
 const screen=await figma.getNodeByIdAsync('9:219');
 const badges=await Promise.all(['49:15','49:17','49:19'].map(id=>figma.getNodeByIdAsync(id)));
 if(!screen||screen.type!=='FRAME'||badges.some(n=>!n||n.type!=='TEXT'))throw new Error('Expected cards are missing; no changes made.');
 const styles=await figma.getLocalTextStylesAsync(),sm=Object.fromEntries(styles.map(s=>[s.name,s]));
 const variables=await figma.variables.getLocalVariablesAsync(),vm=Object.fromEntries(variables.map(v=>[v.name,v]));
 const fonts=new Map([...styles.map(s=>s.fontName),...badges.flatMap(n=>n.getStyledTextSegments(['fontName']).map(s=>s.fontName))].map(f=>[JSON.stringify(f),f]));
 await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
 const paint=(key,opacity=1)=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0},opacity},'color',vm['Color/'+key]);
 const fill=(n,key)=>n.fills=[paint(key)],bind=(n,field,key)=>n.setBoundVariable(field,vm[key]);
 function frame(parent,name,width,dir='VERTICAL',gap=8,pad=0,bg=null,component=false){
  const n=record(component?figma.createComponent():figma.createFrame());parent.appendChild(n);n.name=name;n.layoutMode=dir;n.resize(width,1);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';n.itemSpacing=gap;n.paddingTop=pad;n.paddingBottom=pad;n.paddingLeft=pad;n.paddingRight=pad;n.fills=[];n.clipsContent=false;
  if(vm['Space/'+gap])bind(n,'itemSpacing','Space/'+gap);
  if(vm['Space/'+pad])for(const f of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])bind(n,f,'Space/'+pad);
  if(bg)fill(n,bg);return n;
 }
 function text(parent,value,style='Body/Small',color='Text primary',width=null,size=null){
  const n=record(figma.createText());parent.appendChild(n);n.name=value;n.fontName=sm[style].fontName;pendingStyles.push(n.setTextStyleIdAsync(sm[style].id));n.characters=value;n.fills=[paint(color)];
  if(size!==null){customSizes.push({n,size});n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.35)};}
  if(width!==null){n.textAutoResize='HEIGHT';n.resize(width,n.height);}else n.textAutoResize='WIDTH_AND_HEIGHT';return n;
 }
 const radius=(n,r=16)=>bind(n,'cornerRadius','Radius/'+r),border=n=>{n.strokes=[paint('Border')];n.strokeWeight=1;};
 async function reaction(n,actions){await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions}]);mutated.push(n.id);}
 const closeAction=[{type:'CLOSE'}];
 const section=record(figma.createSection());section.name=SECTION_NAME;section.x=Math.max(...figma.currentPage.children.filter(n=>n!==section).map(n=>n.x+n.width))+240;section.y=4026;section.resizeWithoutConstraints(2310,1150);
 const title=text(section,'Sjóður · styrkir og forgangur','Heading/L');title.x=32;title.y=32;
 const library=frame(section,'Sjóður · reusable rows',354,'VERTICAL',24);library.x=1870;library.y=90;
 const sponsorMaster=frame(library,'Sponsor / Contribution',354,'VERTICAL',4,12,'Raised',true);radius(sponsorMaster,12);border(sponsorMaster);
 sponsorMaster.description='Sponsor amount is the contribution to this hittingur. History recognizes recurring support over time.';
 const top=frame(sponsorMaster,'Name and current contribution',330,'HORIZONTAL',8);top.primaryAxisAlignItems='SPACE_BETWEEN';
 function prop(master,node,key,value){const id=master.addComponentProperty(key,'TEXT',value);node.componentPropertyReferences={characters:id};return id;}
 const sp={};sp.name=prop(sponsorMaster,text(top,'Saga','Label/Medium'),'Name','Saga');sp.amount=prop(sponsorMaster,text(top,'6.000 kr.','Meta/Mono','Success'),'Amount','6.000 kr.');
 sp.recurring=prop(sponsorMaster,text(sponsorMaster,'Mánaðarlegur · 6.000 kr. / mán.','Body/Small','Text secondary',330),'Recurrence','Mánaðarlegur · 6.000 kr. / mán.');
 sp.history=prop(sponsorMaster,text(sponsorMaster,'Styrkt í 3 mánuði · 18.000 kr. samtals','Body/Small','Success',330),'History','Styrkt í 3 mánuði · 18.000 kr. samtals');
 const attendeeMaster=frame(library,'Attendance / Sponsor priority',354,'HORIZONTAL',8,12,'Surface',true);radius(attendeeMaster,12);attendeeMaster.counterAxisAlignItems='CENTER';
 attendeeMaster.description='Sponsors are ordered first and visibly recognized in attendance lists for limited groups.';
 const al=frame(attendeeMaster,'Member and priority',244,'VERTICAL',2);
 const ap={name:prop(attendeeMaster,text(al,'Saga','Label/Medium'),'Name','Saga'),role:prop(attendeeMaster,text(al,'Styrktaraðili · Forgangur','Body/Small','Success',244),'Role','Styrktaraðili · Forgangur'),status:prop(attendeeMaster,text(attendeeMaster,'Mætir','Body/Small','Text secondary'),'Status','Mætir')};
 await Promise.all(pendingStyles);
 const events=[
  {title:'Kaffi og spjall á KEX',total:'12.000',count:3,attendance:'14 af 20 skráðir',limited:true,sponsors:[{name:'Saga',amount:'6.000',recurring:'Mánaðarlegur · 6.000 kr. / mán.',history:'Styrkt í 3 mánuði · 18.000 kr. samtals'},{name:'Einar',amount:'4.000',recurring:'Mánaðarlegur · 4.000 kr. / mán.',history:'Styrkt í 1 mánuð · 4.000 kr. samtals'},{name:'KEX Hostel',amount:'2.000',recurring:'Stakur styrkur',history:'2.000 kr. í þennan hitting'}],attendees:['Saga','Einar','Viktor'],others:11},
  {title:'Queer gönguferð um Elliðaárdal',total:'0',count:0,attendance:'32 skráðir',limited:false,sponsors:[],attendees:['Alex','Birna'],others:30},
  {title:'Borðspilakvöld á Gauknum',total:'8.000',count:2,attendance:'8 af 15 skráðir',limited:true,sponsors:[{name:'Anna',amount:'5.000',recurring:'Stakur styrkur',history:'5.000 kr. í þennan hitting'},{name:'Kjartan',amount:'3.000',recurring:'Mánaðarlegur · 3.000 kr. / mán.',history:'Styrkt í 3 mánuði · 9.000 kr. samtals'}],attendees:['Anna','Kjartan','Viktor'],others:5}
 ];
 const panels=[];
 for(let i=0;i<events.length;i++){
  const e=events[i],panel=frame(section,'Sjóður / '+e.title+' / Open',402,'VERTICAL',16,24,'Canvas');panel.x=498+i*442;panel.y=90;radius(panel,24);border(panel);
  const h=frame(panel,'Sjóður and close',354,'HORIZONTAL',8);h.primaryAxisAlignItems='SPACE_BETWEEN';h.counterAxisAlignItems='CENTER';text(h,'Sjóður','Heading/L');
  const close=frame(h,'Close sponsors',32,'HORIZONTAL',0,8,'Raised');radius(close,8);text(close,'×');await reaction(close,closeAction);
  text(panel,e.title,'Label/Medium','Text secondary',354);
  const total=frame(panel,'Total cash payout',354,'VERTICAL',4,16,'Raised');radius(total,16);
  const tl=frame(total,'Total and example label',322,'HORIZONTAL',8);tl.primaryAxisAlignItems='SPACE_BETWEEN';tl.counterAxisAlignItems='CENTER';text(tl,'💰 '+e.total+' kr.','Meta/Mono','Success',null,25);text(tl,'DÆMI','Label/Medium','Text muted');
  text(total,'Til útgreiðslu til þátttakenda','Body/Small','Text secondary',322);
  const sh=frame(panel,'Sponsor list disclosure / Open',354,'HORIZONTAL',8);sh.primaryAxisAlignItems='SPACE_BETWEEN';text(sh,'Styrktaraðilar ('+e.count+')','Heading/M');const hide=text(sh,'Fela lista ⌃','Label/Medium','Success');await reaction(hide,closeAction);
  const rows=frame(panel,'Sponsor contributions',354,'VERTICAL',8);
  for(const s of e.sponsors){const inst=record(sponsorMaster.createInstance());rows.appendChild(inst);inst.name='Sponsor · '+s.name;inst.setProperties({[sp.name]:s.name,[sp.amount]:s.amount+' kr.',[sp.recurring]:s.recurring,[sp.history]:s.history});}
  if(!e.sponsors.length){const empty=frame(rows,'No sponsors yet',354,'VERTICAL',8,16,'Raised');radius(empty,12);text(empty,'Engir styrktaraðilar enn','Label/Medium');text(empty,'Sjóðurinn birtir upphæðina þegar styrkir berast.','Body/Small','Text secondary',322);}
  const attendance=frame(panel,'Attendance · sponsors first',354,'VERTICAL',8);
  const ah=frame(attendance,'Attendance header',354,'HORIZONTAL',8);ah.primaryAxisAlignItems='SPACE_BETWEEN';text(ah,'Þátttakendur','Heading/M');text(ah,e.attendance,'Meta/Mono','Text secondary');
  text(attendance,e.limited?'Styrktaraðilar birtast fyrst og fá forgang þegar pláss er takmarkað.':'Opinn hópur · ekkert hámark á fjölda.','Body/Small','Text secondary',354);
  for(let j=0;j<e.attendees.length;j++){const inst=record(attendeeMaster.createInstance());attendance.appendChild(inst);inst.name='Attendance · '+e.attendees[j];inst.setProperties({[ap.name]:e.attendees[j],[ap.role]:e.limited&&j<2?'Styrktaraðili · Forgangur':'Þátttakandi',[ap.status]:'Mætir'});}
  text(attendance,'+ '+e.others+' aðrir þátttakendur','Body/Small','Text muted');text(panel,'Dæmi um framsetningu · nöfn og upphæðir eru sýnigögn.','Body/Small','Text muted',354);
  panels.push(panel);
 }
 const originalDisclosureIds=[];
 for(let i=0;i<badges.length;i++){
  const b=badges[i],e=events[i],content=b.parent.parent;b.characters='💰 Sjóður · '+e.total+' kr.';b.name=b.characters;mutated.push(b.id);
  text(content,'Til útgreiðslu til þátttakenda','Body/Small','Text secondary',228,9);
  const disclosure=frame(content,'Sjóður · show sponsors',228,'HORIZONTAL',8);disclosure.primaryAxisAlignItems='SPACE_BETWEEN';disclosure.counterAxisAlignItems='CENTER';text(disclosure,'Sjá styrktaraðila ('+e.count+') ▾','Label/Medium','Success',null,10);text(disclosure,'DÆMI','Body/Small','Text muted',null,9);
  const action=[{type:'NODE',destinationId:panels[i].id,navigation:'OVERLAY',transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration:0.2}}];await reaction(disclosure,action);await reaction(b.parent,action);originalDisclosureIds.push(disclosure.id);mutated.push(content.id,content.parent.id);
 }
 await Promise.all(pendingStyles);for(const {n,size} of customSizes){n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.35)};}
 const overview=record(screen.clone());section.appendChild(overview);overview.name='Hittingar · Sjóður / Closed';overview.x=32;overview.y=90;mutated.push(screen.id);
 figma.currentPage.selection=[overview,panels[0]];figma.viewport.scrollAndZoomIntoView([overview,panels[0]]);
 return {success:true,sectionId:section.id,overviewId:overview.id,originalScreenId:screen.id,originalDisclosureIds,panels:panels.map(p=>({id:p.id,name:p.name,width:p.width,height:p.height})),componentIds:[sponsorMaster.id,attendeeMaster.id],createdNodeIds:created,mutatedNodeIds:[...new Set(mutated)]};
}
figma.ui.onmessage=async msg=>{
 if(!msg||typeof msg.type!=='string')return;
 if(msg.type==='source-ack'){if(sourceAck&&msg.id===sourceAck.id&&msg.index===sourceAck.index)sourceAck.settle(msg.error);return;}
 if(msg.type==='export-source'){
  if(exporting||applying)return;exporting=true;
  try{const source=await exportSource();await sourceDownload(source)}
  catch(error){figma.ui.postMessage({type:'source-error',error:String(error.message||error)})}
  finally{exporting=false}return;
 }
 if((exporting||applying)&&msg.type!=='close')return;
 if(msg.type==='focus'){const n=await figma.getNodeByIdAsync('53:193');figma.currentPage.selection=[n];figma.viewport.scrollAndZoomIntoView([n]);figma.closePlugin();return;}
 if(msg.type==='audit'){
  const section=await figma.getNodeByIdAsync('53:16'),screen=await figma.getNodeByIdAsync('53:193');
  const disclosures=await Promise.all(['53:176','53:182','53:188'].map(id=>figma.getNodeByIdAsync(id)));
  const panels=await Promise.all(['53:30','53:87','53:124'].map(id=>figma.getNodeByIdAsync(id)));
  const textProblems=section.findAll(n=>n.type==='TEXT'&&n.parent.type!=='SECTION'&&(n.width<=0||n.height<=0||n.x+n.width>n.parent.width+1||n.y+n.height>n.parent.height+1)).map(n=>({id:n.id,name:n.name,parent:n.parent.name,width:n.width,height:n.height}));
  const result={sectionId:section.id,originalScreenId:'9:219',overviewId:screen.id,screenHeight:screen.height,disclosures:disclosures.map(n=>({id:n.id,width:n.width,height:n.height,reactions:n.reactions})),panels:panels.map(p=>({id:p.id,width:p.width,height:p.height,closeControls:p.findAll(n=>n.name==='Close sponsors'||n.name==='Fela lista ⌃').map(n=>({id:n.id,reactions:n.reactions})),sponsors:p.findAll(n=>n.type==='INSTANCE'&&n.name.startsWith('Sponsor · ')).map(n=>({id:n.id,name:n.name,properties:n.componentProperties})),attendance:p.findAll(n=>n.type==='INSTANCE'&&n.name.startsWith('Attendance · ')).map(n=>({id:n.id,name:n.name}))})),textProblems,allCreatedNodeIds:[section.id,...section.findAll().map(n=>n.id)]};
  figma.ui.postMessage({type:'report',value:result});return;
 }
 if(msg.type==='close'){if(sourceAck)sourceAck.settle('Export cancelled.');figma.closePlugin();return;}if(msg.type!=='apply'||applying)return;applying=true;
 try{const result=await build();figma.ui.postMessage({type:'report',value:result});figma.notify(result.alreadyApplied?'Sjóður design already exists':'Updated Sjóður, sponsors and attendance priority');}
 catch(e){figma.ui.postMessage({type:'report',value:{success:false,error:String(e.message||e),createdNodeIds:created,mutatedNodeIds:mutated}});figma.notify('Sjóður design: '+e.message,{error:true});}finally{applying=false;}
};
