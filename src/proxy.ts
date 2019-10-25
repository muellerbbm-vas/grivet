const proxyPolyfill = require('proxy-polyfill/proxy.min.js');

/**
 * Generate a proxy, uses Polyfill if Proxy() is not natively supported by the JS runtime
 * @param target
 * @param handler
 */
export const proxyWrapper = (target: any, handler: any): ProxyConstructor => {
  let proxy: ProxyConstructor;
  try {
    // tslint:disable-next-line: no-unsafe-any
    proxy = new Proxy(target, handler) as ProxyConstructor;
  } catch (err) {
    // tslint:disable-next-line: no-unsafe-any
    proxy = new proxyPolyfill.ProxyPolyfill(target, handler) as ProxyConstructor;
  }
  return proxy;
};
