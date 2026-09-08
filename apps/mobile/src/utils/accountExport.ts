import { Platform, Share } from 'react-native';
/** No background export or external upload. The member explicitly chooses a save/share destination. */
export async function saveAccountExport(json: string): Promise<void> {
  JSON.parse(json);
  if (Platform.OS === 'web') {
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='hittumst-account.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } else {
    await Share.share({title:'Hittumst account export',message:json});
  }
}
