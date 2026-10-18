import fittingRoom from '../assets/fitting-room.html?raw';

export const dynamic='force-dynamic';
export async function GET(){
  // Original CSS/JS remains in public/; original HTML is preserved in assets/.
  // This served document adds only judge access/sample affordances, separately.
  const html=fittingRoom.replace('through this local server','through this app’s server')
    .replace('This is a local prototype; public judging access and final submission are pending.','')
    .replace('</head>','<link rel="stylesheet" href="/judge.css"></head>')
    .replace('</body>','<script type="module" src="/judge-access.mjs"></script></body>');
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
