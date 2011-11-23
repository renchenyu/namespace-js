/* namespace-js Copyright (c) 2010 @hiroki_daichi */
/* Namespace注解版 */
/* Namespace不是个类，只是个function而已 
   函数的返回值是一个NamespaceDefinition实例
*/
var Namespace = (function(){
    /* utility */
    /* 将一个对象的自有属性copy到另一个对象中 */
    var merge = function(target, source){
        for(var p in source)
            if(source.hasOwnProperty( p )) target[p] = source[p];
        return target;
    };
    var _assertValidFQN = function(fqn){
        if(!(/^[a-z0-9_.]+/).test(fqn)) throw('invalid namespace');
    };

    var Procedure = function _Private_Class_Of_Proc(){
        merge(this, {
            state  : {},     //用于各个step间共享信息用的
            steps  : [],     //N个step，是干活的
            _status: 'init'  //Procedure实例的状态
        });
        /* 这段等同于 
        this.state = {};
        this.steps = [];
        this._status = 'init';
        */
    };
    /* 下面这段等同于
    Procedure.prototype.next = function(state) {...}
    Procedure.prototype.isRunning = function() {...}
    */
    merge(Procedure.prototype, {
        /* 这里的参数命名不太好，state应该改成step */
        next: function(state){
            if(state) this.enqueue(state);
            return this;
        },
        isRunning: function(){
            return (this._status === 'running');
        },
        /* state -> step */
        enqueue: function(state){
            this.steps.push(state);
        },
        dequeue: function(){
            return this.steps.shift();
        },
        call: function(initialState,callback){
            /* 这个先看懂_invoke再回来看 */
            if( this.isRunning() )  throw("do not run twice"); 

            this.state = initialState || {};
            /* 这是最后一个step, 用来调用传进来的callback */
            this.enqueue(function($c){
                $c();
                if(callback)callback(this);
            });
            this._status = 'running';
            this._invoke();
        },
        _invoke: function(){
            var _self = this;
            /* 从队列头取出一个step */
            var step  = _self.dequeue();
            /* 没有step了，完成！ */
            if( !step ){
                _self._status = 'finished';
                return;
            }
            /* 如果step是一个‘函数’ */
            if( step.call ) {
                /* 把step实现中的this绑定在_self.state上，并传递一个回调函数 
                   从这里可以看出调用next时传入的step应该是一个function(叫A吧）,
                   这个A接受一个参数，这个参数的类型是一个function（叫B吧)，
                   在这个A的实现中，可以通过this来获得当前Procedure实例的状态，
                   并且需要调用回调函数B，调用的参数是state(是个object,或者叫hash)
                   
                   举个function A的例子：
                   function decideDirection(callback) {
                       var state = this;
                       if (state.gender == 'm') {
                           state.direction = "right";
                       }
                       elsif (state.gender == 'f') {
                           state.direction = "left";
                       }
                       callback(state);  
                       //其实不传state也可以，因为本身就是改的_self.state, 
                       //但是如果想整个替换掉state，就必须传啦
                   }
                   假设前面的step提供了gender这个属性，那这里就通过gender来决定direction，供
                   之后的step使用。
                   在这个例子中是最后调用了callback，也就是会按照steps的顺序执行，如果想反过来，
                   可以第一步就执行callback(this); (当然，steps中的函数肯定是顺序执行的，只是具体
                   做的事情反了，和二叉树的3种遍历方式类似，但是通常都是最后调用callback!
                */
                return step.call( _self.state,function _cont(state){
                    if( state ) _self.state = state;
                    _self._invoke();
                });
            }
            /* 除了step是function外，也可以是[] */
            var finishedProcess = 0;
            if( step.length === 0 ) _self._invoke();
            /* 当然...数组中的每个entry还是得是function 
               用数组的场景是多任务并发，然后都结束后再进行下一个step
               比如多个ajax请求...
               
               和上面的类似，数组中的每个entry都是function A
               function A接受一个回调函数B，当完成任务时调用这个回调就可以了
               
               [
                   function foo(callback) {
                       Ajax.request(....,
                            onComplete : function() {
                                callback()
                            }
                        );
                   },
                   function boo(callback) {
                        //和foo类似
                   }
               ]
            */
            for(var i =0,l=step.length;i<l;i++){
                step[i].call(_self.state,function _joinWait(){
                    finishedProcess++;
                    if( finishedProcess == l ){
                        _self._invoke();
                    }
                });
            }
        }
    });
    /* 这个Procedure到底有什么价值呢？
       如果写过多个异步调用的就会发现，会写出如下的代码
       Ajax.request(...,
           onComplete : function(result) {
               if (result) {
                   Ajax.request(...,
                       onComplete: function(result) {
                          ....
                       }
                   );
               }
               else {
                   Ajax.request(...,
                       onComplete: function(result) {
                          ....
                       }
                   );
               }
           
           }
       );
       嵌套会非常的深，很难读，用next就可以写成
       .next(function(cb) {
           Ajax.request(...,
               onComplete: function(result) {
                   this.result = result;
                   cb(this);
               }
           );
       }).next(function(cb) {
           if (this.result) {
               //ajax request
           }
           else {
               //another ajax request
           }
       
       });
       其实类似的有很多，如Deferred, Brook中的部分
       */
       
    var createProcedure = function(state) {
        return new Procedure().next(state);
    };

    /* NamespaceObject类，实例代表某个namespace, stash是这个namespace所能提供的东东，和ns.provide对应 */
    var NamespaceObject = function _Private_Class_Of_NamespaceObject(fqn){
        merge(this, {
            stash: { CURRENT_NAMESPACE : fqn },
            fqn  : fqn,
            proc : createProcedure()
        });
    };
    merge(NamespaceObject.prototype, {
        enqueue: function(context) { 
            this.proc.next(context); 
        },
        call: function(state,callback) { 
            this.proc.call(state, callback); 
        },
        valueOf: function() { 
            return "#NamespaceObject<" + this.fqn + ">"; 
        },
        merge: function(obj) {
            merge(this.stash,obj);
            return this;
        },
        getStash: function() {
            return this.stash;
        },
        getExport: function(importName) {
            /* 从这个可以看出，importName可以是*， 就是导出所有的 */
            if (importName === '*') return this.stash;

            /* 也可以显示指定，用","来分割 */
            var importNames = importName.split(','),
                retStash    = {};
            for(var i = 0,l=importNames.length;i<l;i++){
                /* 甚至还可以用=>，用来改名 */
                var names = importNames[i].split('=>');
                if (1 < names.length) {
                  retStash[ names[1] ] = this.stash[ names[0] ];
                }
                else {
                  retStash[ importNames[i] ] = this.stash[ importNames[i] ];
                }
            }
            return retStash;
        }
    });
    /* 这是一个对象，不是类，用于创建NamespaceObject实例, 从这里出来的都是单例 */
    var NamespaceObjectFactory = (function() {
        var cache = {};
        return {
            create :function(fqn){
                _assertValidFQN(fqn);
                return (cache[fqn] || (cache[fqn] = new NamespaceObject(fqn)));
            }
        };
    })();

    /* 又是一个新的类，Namespace定义类，需要NamespaceObject实例作为初始化的参数 */
    var NamespaceDefinition = function _Private_Class_Of_NamespaceDefinition(nsObj) {
        merge(this, {
            namespaceObject: nsObj,
            requires       : [],
            useList        : [],
            stash          : {},
            defineCallback : undefined
        });
        var _self = this;
        /* 因为nsObj是从factory里出来的，都是单例，这enqueue是为了在被use时，先apply自己 */
        nsObj.enqueue(function($c){ _self.apply($c); });
    };
    merge(NamespaceDefinition.prototype, {
        use: function(syntax){
            this.useList.push(syntax);
            /* 从这里看出要 use('SomeNamespace someobj1,someobj2') */
            var splitted   = syntax.split(/\s+/);
            var fqn        = splitted[0];
            splitted[0] = '';
            var importName = splitted.join('');
            _assertValidFQN(fqn);
            /* 这里push是干嘛用的，先看下去~~ */
            this.requires.push(function($c){
                var context = this;
                var require = NamespaceObjectFactory.create(fqn);
                require.call(this,function(state){
                    context.loadImport(require,importName);
                    $c();
                });
            });
            return this;
        },
        _mergeStashWithNS: function(nsObj){
            var nsList  = nsObj.fqn.split(/\./);
            var current = this.getStash();

            for(var i = 0,l=nsList.length;i<l-1;i++){
                if( !current[nsList[i]] ) current[nsList[i]] = {};
                current = current[nsList[i]];
            }

            var lastLeaf = nsList[nsList.length-1];
            current[lastLeaf] = merge(current[lastLeaf] || {}, nsObj.getStash());
        },
        loadImport: function(nsObj,importName){
            if( importName ){
                merge( this.stash, nsObj.getExport(importName) );
            }else{
                this._mergeStashWithNS( nsObj );
            }
        },
        /* 这个方法我们常用，定义一个Namespace的主要代码都在里面
           我们写的时候大致是这样的
           define(function(ns) {
               var someClass = ns.otherNamespaceProvided;
               ns.provide({
                   foo : Foo(),
                   boo : Boo()
               });
           });
           知道怎么用看代码会更容易一点
        */
        define: function(callback){
            //这里的callback就是我们写的function(ns) {}
            var nsDef = this, nsObj = this.namespaceObject;
            this.defineCallback = function($c) {
                var ns = { 
                    provide : function(obj){
                        nsObj.merge(obj);  //provide里的东西就是在这进入NamespaceObject的stash的
                        $c();
                    } 
                }; 
                merge(ns, nsDef.getStash());  
                merge(ns, nsObj.getStash());
                callback(ns);
            };
            //注意！ define调用完其实只是初始化了这个实例的defineCallback，你写的代码是不会被执行的！
        },
        getStash: function(){
            return this.stash;
        },
        valueOf: function(){
            return "#NamespaceDefinition<"+this.namespaceObject+"> uses :" + this.useList.join(',');
        },
        // 让你写的代码动起来的关键在这！
        apply: function(callback){
            var nsDef = this;
            /* 看懂这里就要靠之前Procedure的知识了 */
            createProcedure(nsDef.requires)   //第一步，让use起作用，这里的requires是数组哦
            .next(nsDef.defineCallback)
            .call(nsDef,function(){
                callback( nsDef.getStash() );
            });
        }
    });

    var createNamespace = function(fqn){
        return new NamespaceDefinition(
            NamespaceObjectFactory.create(fqn || 'main')
        );
    };
    merge(createNamespace, {
        'Object'  : NamespaceObjectFactory,
        Definition: NamespaceDefinition,
        Proc      : createProcedure
    });
    return createNamespace;
})();

Namespace.use = function(useSyntax){ return Namespace().use(useSyntax); }
Namespace.fromInternal = Namespace.GET = (function(){
    var get = (function(){
        var createRequester = function() {
            var xhr;
            try { xhr = new XMLHttpRequest() } catch(e) {
                try { xhr = new ActiveXObject("Msxml2.XMLHTTP.6.0") } catch(e) {
                    try { xhr = new ActiveXObject("Msxml2.XMLHTTP.3.0") } catch(e) {
                        try { xhr = new ActiveXObject("Msxml2.XMLHTTP") } catch(e) {
                            try { xhr = new ActiveXObject("Microsoft.XMLHTTP") } catch(e) {
                                throw new Error( "This browser does not support XMLHttpRequest." )
                            }
                        }
                    }
                }
            }
            return xhr;
        };
        var isSuccessStatus = function(status) {
            return (status >= 200 && status < 300) || 
                    status == 304 || 
                    status == 1223 ||
                    (!status && (location.protocol == "file:" || location.protocol == "chrome:") );
        };
        
        return function(url,callback){
            var xhr = createRequester();
            xhr.open('GET',url,true);
            xhr.onreadystatechange = function(){
                if(xhr.readyState === 4){
                    if( isSuccessStatus( xhr.status || 0 )){
                        callback(true,xhr.responseText);
                    }else{
                        callback(false);
                    }
                }
            };
            xhr.send('')
        };
    })();

    return function(url,isManualProvide){
        return function(ns){
            get(url,function(isSuccess,responseText){
                if( isSuccess ){
                    if( isManualProvide )
                        return eval(responseText);
                    else
                        return ns.provide( eval( responseText ) );
                }else{
                    var pub = {};
                    pub[url] = 'loading error';
                    ns.provide(pub);
                }
            });
        };
    };
})();

Namespace.fromExternal = (function(){
    var callbacks = {};
    var createScriptElement = function(url,callback){
        var scriptElement = document.createElement('script');

        scriptElement.loaded = false;
        
        scriptElement.onload = function(){
            this.loaded = true;
            callback();
        };
        scriptElement.onreadystatechange = function(){
            if( !/^(loaded|complete)$/.test( this.readyState )) return;
            if( this.loaded ) return;
            scriptElement.loaded = true;
            callback();
        };
        scriptElement.src = url;
        document.body.appendChild( scriptElement );
        return scriptElement.src;
    };
    var domSrc = function(url){
        return function(ns){
            var src = createScriptElement(url,function(){
                var name = ns.CURRENT_NAMESPACE;
                var cb = callbacks[name];
                delete callbacks[name];
                cb( ns );
            });
        }
    };
    domSrc.registerCallback = function(namespace,callback) {
        callbacks[namespace] = callback;
    };
    return domSrc;
})();

try{ module.exports = Namespace; }catch(e){}
