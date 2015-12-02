'use strict';

var nodeUrl = require('url');
var nodePath = require('path');
var nodeFs = require('fs');
var nodeUtil = require('util');

var util = require('lang-utils');

module.exports = new astro.Middleware({
    modType: 'page',
    fileType: 'js'
}, function(asset, next) {
    var project = asset.project;
    var prjCfg = Object.assign({
        source: {},
        unCombine: []
    }, asset.prjCfg);
    getJsDependent(asset, function(errorMsg, jsLibs) {

        asset.jsLibs = [errorMsg, jsLibs];
        next(asset);return;
        let jsLibCode = '',
            unCombined = [],
            combined = [],
            tmpJslibs = jsLibs;
        // 加载所有JS组件
        jsLibs = jsLibs.map(function(js) {
            if (util.inArray(js, prjCfg.unCombined)) {
                unCombined.push(prjCfg.source[js] || js);
            } else {
                combined.push(js);
                return new astro.Asset({
                    ancestor: asset,
                    modType: 'jsCom',
                    fileType: 'js',
                    name: js,
                    project: project
                });
            }
        });

        let reader = astro.Asset.getContents(jsLibs);
        
        reader.then(function(assets) {
            var errorMsg = '';
            assets.forEach(function(at) {
                if (at.data) {
                    jsLibCode += ['','/* '+ at.filePath +' */', at.data, ''].join('\n');
                    return;
                }
                errorMsg += nodeUtil.format('\n/* jsLib(%s) is miss, project:%s */', js, project);
            });
            try{
                jsLibCode = '/* unCombined:' + unCombined.join(',') + ' */\n/* jsCom:' + combined.join(',') + ' */ \n' + jsLibCode + '\n';
                asset.data = [errorMsg, jsLibCode, '/* ' + asset.filePath+ ' */', asset.data].join('\n');
                asset.jsLibs = tmpJslibs;
                next(asset);
            }catch(e){
                console.log(e);
            }
        })
    });
});

// 获取代码里的引用关系
function getReference(code) {
    let ret = [];
    code.replace(/@require\s+(\S+)/g, function(a, reqjs) {
        ret = ret.concat(reqjs.split(','));
    });
    return ret;
}

function getJsDependent(asset, callback) {
    let errorMsg = '';
    let jsLibs = getReference(asset.data);
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
                        errorMsg += '/* jsLib:' + jsLibs[i] + ' is miss or empty */\n';
                    } else {
                        jsLibs = jsLibs.concat(getReference(asset.data));
                    }
                    i++;
                    process.next();
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
}