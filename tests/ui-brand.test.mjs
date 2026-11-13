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
