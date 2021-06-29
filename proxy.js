/**
 * cfworker反向代理工具
 * reference: https://developer.mozilla.org/zh-CN/docs/Web/API/URL
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
  //获取服务器hostname,Protocol,Port
  let srvurl=new URL(request.url);
  let srvHostname = srvurl.hostname;
  let reqHostname = null;
  let reqProtocol = null;
  let reqPort = null;
  let reqReferer = null;
  let reqRefererd = null;
  let refHost = null;
  let havereqPort = true;
  let enableReferRewrite = true;
  let enableUrlRewrite = true;
  //取域名第一个斜杠后的所有信息为代理链接
  let url = request.url.substr(8);
  url = url.substr(url.indexOf('/') + 1);
  //返回对象
  var response;
  
  //需要忽略的代理
  if (request.method == "OPTIONS" || url.length == 0 || url == "favicon.ico" || url == "robots.txt") {
    //输出提示
    var htm = [];
    var htmHeaders = new Headers;
    htmHeaders.set("content-type", "text/html");
    htm.push("<html><body>");
    htm.push("<h1>404 Page Not Found</h1>");
    htm.push("Request file not found on this server.");
    htm.push("<hr>");
    htm.push("HTTP Server at tc.0110.inaddr Port 8080");
    htm.push("</body></html>");

    response = new Response(htm.join('\n\n'), { 
      status: 404,
      headers: htmHeaders,
       });
  } else {

    //补上前缀 https://
    if (url.toLowerCase().indexOf("http") == -1) {
      url = "https://" + url;
    }
    const requrl = new URL(url);
    //获取目标host
    reqHostname = requrl.hostname;
    //获取protocol
    reqProtocol = requrl.protocol;
    //获取port，没有就设置默认port
    reqPort = requrl.port;
    
    if (reqPort === "") {
      havereqPort = false;
      if (reqProtocol === "http:") {
        reqPort = "80";
      }
      if (reqProtocol === "https:") {
        reqPort = "443";
      }
      requrl.port = reqPort;
    }
    //处理Upgrade请求（websocket）
    var reqHeaders = new Headers(request.headers);
    let connectionType = reqHeaders.get('Connection');
    if (connectionType === 'Upgrade') 
    {
      let uprequest=new Request(requrl,request);
      return fetch(uprequest);
    }
    //获取referer中的Host信息。reference: https://developer.mozilla.org/zh-CN/docs/Web/API/URL/host
    reqReferer = reqHeaders.get('Referer');
    if (reqReferer != null) {
      const reqRefererUrla = new URL(reqReferer);
      refHost = reqRefererUrla.host;
    } else {
      refHost = srvHostname+':'+reqPort;
    }
    //改写referer，复原请求原本的referer
    if (enableReferRewrite == true) {
      if (reqReferer !== null) {
        reqReferer = reqReferer.substr(8);
        reqReferer = reqReferer.substr(reqReferer.indexOf('/') + 1);
          if (reqReferer.toLowerCase().indexOf("http") == -1) {
            reqReferer = "https://" + reqReferer;
          }
      reqHeaders.set('Referer', reqReferer);
      //console.log(reqReferer); 
      } else {
        reqReferer="";
      }
    }
  
    //跟踪跳转 ref: https://developers.cloudflare.com/workers/runtime-apis/request#requestinit
    const reqInit = {
    'method': request.method,
    'headers': reqHeaders,
    'redirect': 'follow',
    }
    //当连接为POST或PUT时，需要传递body
    if (request.method === 'POST' ||
        request.method === 'PUT'
    ) {
      reqInit.body = request.body
    }
    //发起 fetch
    response = await fetch(requrl, reqInit);
    //跳转相对路径到正确的地址，原理为从referer中获取域名，拼接之后301跳转
    if (reqReferer != "") {
     if (response.status==530 || response.status==502 || (response.status==403 && response.statusText=="Forbidden")) {
      const reqRefererUrl = new URL(reqReferer);
      reqHostname = reqRefererUrl.hostname;
      console.log(requrl.hostname)
      let re = new RegExp('https://', 'g');
      let j = 'https://'+refHost+'/'+reqHostname+'/';
      realurl = requrl.href.replace(re, j);
      return Response.redirect(realurl, 301);
     }
    }
  }

  //添加跨域头
  var myHeaders = new Headers(response.headers);
  myHeaders.set("Access-Control-Allow-Origin", "*");
  myHeaders.set("Access-Control-Allow-Methods", "GET, PUT, PATCH, POST, DELETE");
  myHeaders.set("Access-Control-Allow-Headers", "*");
  myHeaders.set('access-control-allow-credentials', true);
  myHeaders.delete('content-security-policy');
  myHeaders.delete('content-security-policy-report-only');
  myHeaders.delete('clear-site-data');
  //重写返回链接
  let response_clone = response.clone();
  let original_text = null;
  var i, j;
  if (havereqPort === true) {
    reqHostname = reqHostname+":"+reqPort;
  }
  //替换html链接
  const replace_html = {
    'href="/': 'href="/'+reqHostname+'/',
    'href="https://': 'href="https://'+srvHostname+'/',
    'href="http://': 'href="https://'+srvHostname+'/http://',
    'src="//': 'src="'+reqProtocol+'//',
    'src="/': 'src="'+reqProtocol+'//'+reqHostname+'/',
    'srcset="/': 'srcset="/'+reqHostname+'/',
    'src="https://': 'src="https://'+srvHostname+'/',
    'src="http://': 'src="https://'+srvHostname+'/http://',
    'content="https://': 'content="https://'+srvHostname+'/',
    'content="//': 'content="'+reqProtocol+'//',
    'content="/': 'content="/'+reqHostname+'/',
    'url[(]https://': 'url(https://'+srvHostname+'/',
    'url[(]"/': 'url("/'+reqHostname+'/',
    'url[(]/': 'url(/'+reqHostname+'/',
    "src='//": "src='//"+srvHostname+'/',
    "src='/": "src='/"+reqHostname+'/',
    "u='/xjs/": "u='/"+reqHostname+"/xjs/",
    "var s='/": "var s='/"+reqHostname+"/",
  }
  const replace_css = {
    'url[(]"/': 'url("/'+reqHostname+'/',
    //'url[(]https://': 'url(https://'+reqHostname+'/',
    'https://': 'https://'+srvHostname+'/',
    'http://': 'https://'+srvHostname+'/http://',
  }
  const replace_js = {
    "src='//": "src='//"+srvHostname+'/',
    "src='/": "src='/"+reqHostname+'/',
    'https://': 'https://'+srvHostname+'/',
    'http://': 'https://'+srvHostname+'/http://',
  }
  //判断能否替换
  const content_type = myHeaders.get('content-type');
  if (content_type !== null &&
      enableUrlRewrite == true) {
    let text = await response_clone.text();
    if (content_type.includes('text/html')) 
    {
      for (i in replace_html) {
        j = replace_html[i]
        let re = new RegExp(i, 'g')
        text = text.replace(re, j);
      }
    }
    if (content_type.includes('-text/javascript')) 
    {
      for (i in replace_js) {
        j = replace_js[i]
        let re = new RegExp(i, 'g')
        text = text.replace(re, j);
      }
    }
    if (content_type.includes('-text/css')) 
    {
      for (i in replace_css) {
        j = replace_css[i]
        let re = new RegExp(i, 'g')
        text = text.replace(re, j);
      }
    }
    original_text = text;
  } else {
    original_text = response.body;
  }
  
  return new Response(original_text, {
    status: response.status,
    headers: myHeaders
  })
  return myresponse;
}
