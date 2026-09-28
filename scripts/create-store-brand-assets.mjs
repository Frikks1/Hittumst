import fs from 'node:fs/promises';
import sharp from 'sharp';
const output='apps/mobile/assets/store';
await fs.mkdir(output,{recursive:true});
const icon=await fs.readFile('apps/mobile/assets/brand/icon.png');
for (const [locale,lines] of [['is',['Tengsl og hittingar','á Íslandi.']],['en',['Connections','across Iceland.']]]) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#f4f2ec"/>
  <rect x="628" width="396" height="500" fill="#10201b"/>
  <rect x="58" y="62" width="60" height="6" rx="3" fill="#0d705b"/>
  <text x="56" y="175" font-family="Arial, sans-serif" font-size="86" font-weight="700" letter-spacing="-4" fill="#10201b">Hittumst</text>
  <text x="60" y="263" font-family="Arial, sans-serif" font-size="38" font-weight="400" fill="#0d705b">${lines[0]}</text>
  <text x="60" y="311" font-family="Arial, sans-serif" font-size="38" font-weight="400" fill="#0d705b">${lines[1]}</text>
  <rect x="60" y="394" width="66" height="34" rx="17" fill="#dcefe8"/>
  <text x="93" y="418" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#10201b">18+</text>
  <image href="data:image/png;base64,${icon.toString('base64')}" x="628" y="51" width="396" height="396"/>
  </svg>`;
  await fs.writeFile(output+'/feature-graphic-'+locale+'.svg',svg);
  await sharp(Buffer.from(svg)).png().toFile(output+'/feature-graphic-'+locale+'.png');
}
await sharp(icon).resize(512,512).png().toFile(output+'/play-icon-512.png');
console.log('Created two 1024x500 feature graphics and a 512px Play icon from the existing brand.');
