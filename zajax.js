// Zepto port of jquery-Mockjax
// https://github.com/appendto/jquery-mockjax

;(function(){

  var _ajax = $.ajax,
      mock_handlers = {};

  $._ajax = function(opts){
    _ajax(opts);
  }

  $._ajax_content = function(request){
    var ajax_data = $.extend({}, request),
        response;
    ajax_data.async = false;
    ajax_data.success = function(r){
      response = r;
    }
    $._ajax(ajax_data);
    return response;
  }

  function getMockForRequest( handler, requestSettings ) {
    if($.isFunction(handler))
      return handler( requestSettings );

    if($.isFunction(handler.url.test)) {
      if(!handler.url.test( requestSettings.url)){
        return null;
      }
    } else {
      var star = handler.url.indexOf('*');
      if (handler.url !== requestSettings.url && star === -1 || 
          !new RegExp(handler.url.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&").replace('*', '.+')).test(requestSettings.url)) {
        return null;
      }
    }

    if ( handler && handler.type && 
         handler.type.toLowerCase() != requestSettings.type.toLowerCase() ) {
      return null;
    }

    return handler;
  }

  // Process the xhr objects send operation
  function _xhrSend(mockHandler, requestSettings, origSettings) {
    // This is a substitute for < 1.4 which lacks $.proxy
    var process = (function(that) {

      return function() {
        return (function() {
          // The request has returned
          this.status     = mockHandler.status;
          this.statusText   = mockHandler.statusText;
          this.readyState   = 4;

          // We have an executable function, call it to give
          // the mock handler a chance to update it's data
          if ( $.isFunction(mockHandler.response) ) {
            mockHandler.response(origSettings);
          }
          // Copy over our mock to our xhr object before passing control back to
          // jQuery's onreadystatechange callback
          if ( requestSettings.dataType == 'json' && ( typeof mockHandler.responseText == 'object' ) ) {
            this.responseText = JSON.stringify(mockHandler.responseText);
          } else if ( requestSettings.dataType == 'xml' ) {
            if ( typeof mockHandler.responseXML == 'string' ) {
              this.responseXML = parseXML(mockHandler.responseXML);
            } else {
              this.responseXML = mockHandler.responseXML;
            }
          } else {
            this.responseText = mockHandler.responseText;
          }
          if( typeof mockHandler.status == 'number' || typeof mockHandler.status == 'string' ) {
            this.status = mockHandler.status;
          }
          if( typeof mockHandler.statusText === "string") {
            this.statusText = mockHandler.statusText;
          }
          // jQuery < 1.4 doesn't have onreadystate change for xhr
          if ( $.isFunction(this.onreadystatechange) ) {
            if( mockHandler.isTimeout) {
              this.status = -1;
            }
            this.onreadystatechange( mockHandler.isTimeout ? 'timeout' : undefined );
          } else if ( mockHandler.isTimeout ) {
            // Fix for 1.3.2 timeout to keep success from firing.
            this.status = -1;
          }
        }).apply(that);
      };
    })(this);

    if ( mockHandler.proxy ) {
      // We're proxying this request and loading in an external file instead
      _ajax({
        global: false,
        url: mockHandler.proxy,
        type: mockHandler.proxyType,
        data: mockHandler.data,
        dataType: requestSettings.dataType === "script" ? "text/plain" : requestSettings.dataType,
        complete: function(xhr, txt) {
          mockHandler.responseXML = xhr.responseXML;
          mockHandler.responseText = xhr.responseText;
          mockHandler.status = xhr.status;
          mockHandler.statusText = xhr.statusText;
          this.responseTimer = setTimeout(process, mockHandler.responseTime || 0);
        }
      });
    } else {
      // type == 'POST' || 'GET' || 'DELETE'
      if ( requestSettings.async === false ) {
        // TODO: Blocking delay
        process();
      } else {
        this.responseTimer = setTimeout(process, mockHandler.responseTime || 50);
      }
    }
  }

  function xhr(mockHandler, requestSettings, origSettings, origHandler) {
    // Extend with our default mockjax settings
    mockHandler = $.extend( $.extend({}, $.zajax_settings), mockHandler);
    console.log(mockHandler, "^^")
    if (typeof mockHandler.headers === 'undefined') {
      mockHandler.headers = {};
    }
    if ( mockHandler.contentType ) {
      mockHandler.headers['content-type'] = mockHandler.contentType;
    }

    return function(){
      return {
        status: mockHandler.status,
        statusText: mockHandler.statusText,
        readyState: 1,
        open: function() { },
        send: function() {
          origHandler.fired = true;
          _xhrSend.call(this, mockHandler, requestSettings, origSettings);
        },
        abort: function() {
          clearTimeout(this.responseTimer);
        },
        setRequestHeader: function(header, value) {
          mockHandler.headers[header] = value;
        },
        getResponseHeader: function(header) {
          // 'Last-modified', 'Etag', 'content-type' are all checked by jQuery
          if ( mockHandler.headers && mockHandler.headers[header] ) {
            // Return arbitrary headers
            return mockHandler.headers[header];
          } else if ( header.toLowerCase() == 'last-modified' ) {
            return mockHandler.lastModified || (new Date()).toString();
          } else if ( header.toLowerCase() == 'etag' ) {
            return mockHandler.etag || '';
          } else if ( header.toLowerCase() == 'content-type' ) {
            return mockHandler.contentType || 'text/plain';
          }
        },
        getAllResponseHeaders: function() {
          var headers = '';
          $.each(mockHandler.headers, function(k, v) {
            headers += k + ': ' + v + "\n";
          });
          return headers;
        }
      };
    }
  }

  function handle_ajax(url, opts){
    var request_settings, mock_handler, mock_request;

    if(typeof url === "object") {
      opts = url; url = undefined;
    }else opts.url = url;
    
    request_settings = $.extend( $.extend({}, $.ajaxSettings), opts);

    for(var key in mock_handlers){
      if(!mock_handlers[key])  continue;
      mock_handler = getMockForRequest( mock_handlers[key], request_settings );
      if(!mock_handler) continue; // No valid mock found for this request

      mock_handler.cache   = request_settings.cache;
      mock_handler.timeout = request_settings.timeout;
      mock_handler.global  = request_settings.global;

      (function(mock_handler, request_settings, opts, orig_handler) {
        var old_xhr_factory = $.ajaxSettings.xhr;
        $.ajaxSettings.xhr = xhr( mock_handler, request_settings, opts, orig_handler );
        mock_request = _ajax.call($, opts);
        $.ajaxSettings.xhr = old_xhr_factory;
      })(mock_handler, request_settings, opts, mock_handlers[key]);

      return mock_request;
    }
    return _ajax.apply($, [opts]);
  };

  $.extend($,{
    ajax:handle_ajax
  })

  $.zajax_settings = {
    //url:        null,
    //type:       'GET',
    log:          function(msg) {
                    window['console'] && window.console.log && window.console.log(msg);
                  },
    status:       200,
    statusText:   "OK",
    responseTime: 500,
    isTimeout:    false,
    contentType:  'text/plain',
    response:     '',
    responseText: '',
    responseXML:  '',
    proxy:        '',
    proxyType:    'GET',

    lastModified: null,
    etag:         '',
    headers: {
      etag: 'IJF@H#@923uf8023hFO@I#H#',
      'content-type' : 'text/plain'
    }
  };

  $.zajax = function(options){
    if(!mock_handlers[options.url])
      mock_handlers[options.url] = options;
    return $;
  };

})();