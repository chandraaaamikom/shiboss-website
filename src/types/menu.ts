export interface MenuItem { id:string; name:string; description:string|null; category:string; price:number; image_url:string|null; is_available:boolean }
export type MenuResult={status:'ready';items:MenuItem[]}|{status:'unconfigured'|'error';items:MenuItem[]};
