'use strict';

var nodeUrl = require('url');
var nodePath = require('path');
var nodeFs = require('fs');
var nodeUtil = require('util');

var util = require('lang-utils');

module.exports = new astro.Middleware({
    modType: 'page',
    fileType: ['js', 'css']
}, function(asset, next) {
    if (!asset.data) {
        next(asset);
        return
    }
    let project = asset.project;
    let prjCfg = Object.assign({
        source: {},
        unCombine: []
    }, asset.prjCfg);
    let data;
    if (asset.fileType === 'css') {
        data = asset.data;
        let _asset = asset.clone();
        _asset.fileType = 'js';
        asset.data = _asset.read();
    }

    getJsDependent(asset, function(errorMsg, jsLibs) {

        asset.jsLibs = asset.jsLibs || ['', []];
        asset.jsLibs[0] = asset.jsLibs[0] ? asset.jsLibs[0] + '\n' + errorMsg :
            errorMsg;
        asset.jsLibs[1] = jsLibs.concat(asset.jsLibs[1]);

        if (asset.fileType === 'css') {
            asset.data = data;
        }

        next(asset);
    });
});

let refer_cache = {};
// 获取代码里的引用关系
function getReference(asset, callback) {
    //读取组件代码
    var tempDate = '';
    let webComCode = '',
        components = [];
    if (asset.components && asset.components.length) {
        components = asset.components.map(function(wc) {
            return new astro.Asset({
                ancestor: asset,
                project: asset.project,
                modType: 'webCom',
                name: wc,
                fileType: 'js'
            });
        })
    }
    //console.log(components);
    let reader = astro.Asset.getContents(components);

    reader.then(function(assets) {
        var wcError = '';
        assets.forEach(function(ast) {
            if (!ast.data)
                wcError += '/* webCom:' + ast.filePath + ' is miss */' + '\n';
            else {
                webComCode += '/* ' + ast.filePath + ' */\n' + ast.data + '\n';
            }
        });
        tempDate = webComCode + (tempDate || '');
        // 读取依赖组件
        tempDate = tempDate + asset.data;
        let cache = refer_cache[asset.filePath] || {};
        if (cache.mtime !== asset.mtime) {
            let ret = [];
            (tempDate || '').replace(/@require\s+(\S+)/g, function(a, reqjs) {
                reqjs.split(',').forEach(function(item) {
                    item = item.replace(/^\s|\s$/, '');
                    if (item) {
                        ret.push(item)
                    }
                });
            });
            cache.data = ret;
            cache.mtime = asset.mtime;

            refer_cache[asset.filePath] = cache;
        }
        callback(cache.data);

    }).catch(function(error) {
        console.error('astro-js-process', error);
        asset.data = error + '\n' + asset.data
        next(asset);
    });

}

function getJsDependent(asset, callback) {
    let errorMsg = '';
    getReference(asset, function(jsLibs) {
        //处理依赖
        if (jsLibs.length > 0) {
            // 处理JS组件依赖关系
            let process = (function*() {
                let i = 0;
                while (jsLibs[i]) {
                    if (i > 1000) {
                        errorMsg += '/* ***** ' + '\n依赖套嵌超过一千次，可能出现死循环\n' + jsLibs.join(',') + '** */\n';
                        console.error('n依赖套嵌超过一千次，可能出现死循环, asset.name:%s, asset.components', asset.name, asset.components ? asset.components.join(',') : 'null');
                        console.info(jsLibs.join(','));
                        break;
                    }
                    new astro.Asset({
                        ancestor: asset,
                        modType: 'jsCom',
                        fileType: 'js',
                        name: jsLibs[i],
                        project: asset.project
                    }).getContent(function(asset) {
                        if (!asset.data) {
                            errorMsg += '/* js-dep -> (' + asset.info + ')' + jsLibs[i] + ' is miss or empty */\n';
                            i++;
                            process.next();
                        } else {
                            getReference(asset, function(tempJsLibs) {
                                jsLibs = jsLibs.concat(tempJsLibs);
                                i++;
                                process.next();
                            });
                        }
                        // i++;
                        // process.next();
                    });
                    yield;
                }
                done();
            }());
            process.next();
        } else {
            done();
        }

        function done() {
            callback(errorMsg, util.dequeueArray(jsLibs).reverse());
        }

    });

}