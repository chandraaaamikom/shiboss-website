import type { MenuItem } from '../../types/menu.ts';
export function safeImageUrl(value:unknown):string|null {
  if(typeof value!=='string'||!value)return null;
  if(/^\/images\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i.test(value))return value;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
}
export function parseMenuRows(value:unknown):MenuItem[]{
  if(!Array.isArray(value))throw new Error('Invalid menu response');
  return value.map((row:unknown):MenuItem=>{
    if(!row||typeof row!=='object')throw new Error('Invalid menu item');
    const item=row as Record<string,unknown>;
    if(typeof item.id!=='string'||!/^[0-9a-f-]{36}$/i.test(item.id)||typeof item.name!=='string'||!item.name.trim()||typeof item.category!=='string'||!item.category.trim()||typeof item.price!=='number'||!Number.isFinite(item.price)||item.price<=0||typeof item.is_available!=='boolean'||(item.description!==null&&typeof item.description!=='string'))throw new Error('Invalid menu item');
    return{id:item.id,name:item.name,category:item.category,price:item.price,description:item.description,image_url:safeImageUrl(item.image_url),is_available:item.is_available};
  });
}
export function parseMenu(value:unknown):MenuItem[]{return parseMenuRows(value).filter(item=>item.is_available);}
export const rupiah=(price:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:2}).format(price);
