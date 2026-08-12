const listeners=new Set();
export function publishUnreadNotifications(count){for(const listener of listeners)listener(Math.max(0,Number(count)||0));}
export function subscribeUnreadNotifications(listener){listeners.add(listener);return()=>listeners.delete(listener);}
