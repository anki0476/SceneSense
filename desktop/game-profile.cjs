const {z}=require('zod');
const profileSchema=z.object({gameName:z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N} .:'&()_+-]+$/u),processName:z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_. -]+$/),scene:z.string().trim().min(1).max(256),webcamSource:z.string().trim().min(1).max(256),gameSource:z.string().trim().min(1).max(256)});
const asphalt={gameName:'Asphalt Legends',processName:'Asphalt9',scene:'SceneSense Test',webcamSource:'Webcam',gameSource:'Game Capture'};
function gameFromSpeech(text){if(typeof text!=='string'||/["“”]/.test(text)||/\b(don't|do not|never|cancel|stop|instead|how|why|suggest|recommend)\b/i.test(text))return null;const match=text.trim().replace(/^(?:hey\s+)?sense[\s,:.!-]*/i,'').match(/^(?:please )?(?:(?:can|could|would) you )?(?:set\s?up|prepare|configure)\s+(?:everything\s+for\s+|(?:my\s+)?)(?:an?\s+)?(.+?)\s+(?:stream|streaming)(?:\s+setup)?[.!?]*$/i);return match?.[1]?.trim()||null;}
module.exports={profileSchema,asphalt,gameFromSpeech};
