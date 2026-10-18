import {env} from 'cloudflare:workers';
import {handleJudgeAPI} from '../../../lib/judge-handler.mjs';

export const dynamic='force-dynamic';
export async function GET(request:Request){return handleJudgeAPI(request,env)}
export async function POST(request:Request){return handleJudgeAPI(request,env)}
