import { z } from 'zod';

const asset=z.string().max(16000000).refine(s=>s===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s));
const color=z.string().regex(/^#[a-f0-9]{6}$/i);
export const topDesignSchema=z.object({
  title:z.string().max(180),subtitle:z.string().max(180),footer:z.string().max(180),
  layout:z.enum(['podium','grid','teams']),ratio:z.enum(['wide','square','portrait']),font:z.enum(['sans-serif','serif','monospace']),game:z.string().regex(/^[a-z0-9_-]{1,50}$/),
  collection:z.string().regex(/^[a-zA-Z0-9_-]{0,100}$/).optional(),artFit:z.enum(['contain','cover']).optional(),
  cardOpacity:z.number().min(0).max(100).optional(),logoSize:z.number().min(100).max(360).optional(),
  nameSize:z.number().min(24).max(60),shade:z.number().min(0).max(90),
  backgroundColor:color,cardColor:color,textColor:color,accentColor:color,background:asset,logo:asset,
  players:z.array(z.object({id:z.string().max(100),name:z.string().max(120),placement:z.number().int().min(1).max(100000).nullable(),
    characters:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(4),skins:z.array(z.string().regex(/^\d{1,8}$/)).max(4).optional(),extra:z.string().max(100),portrait:asset,x:z.number().min(0).max(100),y:z.number().min(0).max(100),zoom:z.number().min(1).max(3),
    roster:z.string().max(4000).optional(),
  }).strict()).max(8),
}).strict();
