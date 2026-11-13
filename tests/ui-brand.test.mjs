import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,statSync} from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const pngs=[
  ['assets/brand/headstart-logo-colour.png',800,200,40000],
  ['assets/brand/headstart-logo-white.png',800,200,40000],
  ['assets/brand/headstart-emblem-colour.png',301,400,30000],
  ['assets/brand/headstart-emblem-white.png',301,400,30000],
  ['assets/icon-512.png',512,512,45000],
  ['assets/icon-192.png',192,192,14000],
  ['assets/icon-180.png',180,180,14000],
  ['assets/icon-32.png',32,32,2500]
];

for(const [path,width,height,maxBytes] of pngs){
  test(path+' is a PNG with the expected dimensions and at most 8-bit channels',()=>{
    const data=readFileSync(new URL(path,root));
    assert.deepEqual(data.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(data.toString('ascii',12,16),'IHDR');
    assert.equal(data.readUInt32BE(16),width);
    assert.equal(data.readUInt32BE(20),height);
    assert.ok(data[24]<=8,'PNG channel depth must be at most 8 bits');
  });
  test(path+' stays within its download size limit',()=>{
    const bytes=statSync(new URL(path,root)).size;
    assert.ok(bytes<=maxBytes,`${path} is ${bytes} bytes; limit is ${maxBytes}`);
  });
}

for(const [variant,size,hash] of [
  ['colour',114888,'4f8b81269dd17f4193918ee655b67fa347cfa891deac7dc623e6ebf59a63fee9'],
  ['white',78736,'fd77c061695afcfdb1b822f8846b07dc34c7af13c3d425abd0eaa069e1d4c9d0']
]){
  test('the original '+variant+' WebP logo is unchanged',()=>{
    const data=readFileSync(new URL('assets/brand/headstart-logo-'+variant+'.webp',root));
    assert.equal(data.length,size);
    assert.equal(createHash('sha256').update(data).digest('hex'),hash);
  });
}

test('the app links the PNG browser and Apple icons and removes the old SVG favicon',()=>{
  const html=readFileSync(new URL('index.html',root),'utf8');
  const head=html.slice(html.indexOf('<head>'),html.indexOf('</head>'));
  const links=head.match(/<link\b[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>/g);
  assert.deepEqual(links,[
    '<link rel="icon" type="image/png" sizes="32x32" href="assets/icon-32.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="assets/icon-180.png">'
  ]);
  assert.doesNotMatch(html,/favicon\.svg/);
  assert.equal(existsSync(new URL('assets/favicon.svg',root)),false);
});

test('the manifest offers the 192 and 512 PNG icons for ordinary and masked use',()=>{
  const manifest=JSON.parse(readFileSync(new URL('site.webmanifest',root),'utf8'));
  assert.deepEqual(manifest.icons,[
    {src:'assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
    {src:'assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}
  ]);
});

const html=readFileSync(new URL('index.html',root),'utf8');
const uiCss=readFileSync(new URL('assets/workspace-ui.css',root),'utf8');
const bootStyle=html.split('<style id="boot-cover-style">')[1].split('</style>')[0];
const header=html.split('<div class="app-header">')[1].split('<nav class="tab-nav"')[0];
const cover=html.split('<div class="boot-cover" id="boot-cover" role="status">')[1].split('</div>\n<script>')[0];
const authBrand=html.split('+\'<div class="auth-brand">')[1].split("</div>'")[0];

test('step 97 embeds one transparent 560 by 140 PNG within the 20,000 byte limit',()=>{
  const matches=[...html.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(matches.length,1);
  const [url,encoded]=matches[0];
  assert.equal(html.split(encoded).length-1,1);
  assert.ok(bootStyle.includes(':root{--hs-logo-white:url("'+url+'");}'));
  assert.equal((html.match(/--hs-logo-white\s*:/g)||[]).length,1);
  const data=Buffer.from(encoded,'base64');
  assert.deepEqual(data.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(data.readUInt32BE(16),560);
  assert.equal(data.readUInt32BE(20),140);
  assert.ok(data.length<=20000,`embedded logo is ${data.length} bytes`);
  const chunks=[];
  for(let offset=8;offset<data.length;){
    const size=data.readUInt32BE(offset);
    chunks.push([data.toString('ascii',offset+4,offset+8),data.subarray(offset+8,offset+8+size)]);
    offset+=12+size;
  }
  assert.ok([4,6].includes(data[25])||chunks.some(([type,alpha])=>type==='tRNS'&&alpha.some(a=>a<255)),'transparency is retained');
  assert.ok(chunks.every(([type])=>['IHDR','PLTE','tRNS','IDAT','IEND'].includes(type)),'metadata is stripped');
});

test('step 97 names the school logo and workspace in the header',()=>{
  assert.match(header,/<span class="app-logo-mark" role="img" aria-label="HeadStart International School, Phuket"><\/span>\s*<span class="app-logo-rule" aria-hidden="true"><\/span>/);
  assert.match(header,/<div class="app-name">Marcom Workspace<\/div>/);
  assert.match(header,/<div class="app-tagline">Marketing &amp; Communications Department<\/div>/);
  assert.doesNotMatch(header,/ti-briefcase/);
  assert.match(html,/<title>HeadStart Marcom Workspace<\/title>/);
});

test('step 97 sizes the full header logo, scroll state and phone emblem without adding row height',()=>{
  const styles=html.slice(0,html.indexOf('</head>'));
  assert.match(styles,/\.app-logo-mark\{display:block;flex-shrink:0;width:152px;height:38px;background:var\(--hs-logo-white\) left center\/contain no-repeat;transition:width \.22s ease,height \.22s ease;/);
  assert.match(styles,/\.app-logo-rule\{display:block;flex-shrink:0;width:1px;height:26px;background:rgba\(255,255,255,\.28\);/);
  assert.match(styles,/@media\(min-width:601px\)\{body\.hdr-scrolled \.app-logo-mark\{width:128px;height:32px;\}\}/);
  assert.match(styles,/@media\(max-width:600px\)\{\s*\.app-logo-mark\{width:26px;height:34px;background-size:auto 100%;background-position:left center;\}\s*\.app-logo-rule\{display:none;\}/);
  assert.match(styles,/\.app-name\{[^}]*white-space:nowrap;/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)\{\.app-logo-mark\{transition:none;\}\}/);
});

test('step 97 uses the shared white logo on the navy loading screen',()=>{
  assert.match(cover,/<div class="boot-cover-logo" role="img" aria-label="HeadStart International School, Phuket"><\/div>/);
  assert.match(cover,/<div class="boot-cover-name">Marcom Workspace<\/div>/);
  assert.match(cover,/<div class="boot-cover-sub">Opening your workspace<\/div>/);
  assert.match(cover,/<div class="boot-cover-bar" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(cover,/ti-briefcase|<svg/);
  assert.match(bootStyle,/\.boot-cover-logo\{width:240px;height:60px;background:var\(--hs-logo-white\) center\/contain no-repeat;\}/);
});

test('step 97 centres the colour logo above the sign-in title on a white card in both themes',()=>{
  assert.match(authBrand,/<img class="auth-logo-img" src="assets\/brand\/headstart-logo-colour.png" width="240" height="60" alt="HeadStart International School, Phuket">/);
  assert.match(authBrand,/<div class="auth-brand-t">Marcom Workspace/);
  assert.match(html,/<div class="auth-brand-s">Marketing &amp; Communications<\/div>/);
  assert.doesNotMatch(authBrand,/ti-briefcase/);
  assert.match(html,/\.auth-logo-img\{display:block;width:240px;height:auto;max-width:100%;margin:0 auto 14px;\}/);
  assert.match(html,/\.auth-card\{[^}]*background:#fff;/);
  assert.doesNotMatch(html+'\n'+uiCss,/html\.dark \.auth-(?:card|brand-t|field input|google|link)\b/);
});

test('step 97 removes the old header, loading and sign-in tile rules at their source',()=>{
  assert.doesNotMatch(html+'\n'+uiCss,/\.logo-icon\b|\.boot-cover-mark\b|\.auth-logo(?!-img)\b/);
  assert.doesNotMatch(html,/class="(?:logo-icon|boot-cover-mark|auth-logo)"/);
});
