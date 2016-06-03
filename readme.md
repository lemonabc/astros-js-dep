# astro-js-dep

astros中间件

解析JS组件依赖。并将依赖的JS组件列表挂载到asset.jsLibs属性上

该中间件简化了组织JS依赖的方式，通过关键字 `@require` 来引用依赖的JS组件

```
    //@require dialog,autocomplete...pluginX
```

通过和astros-js-process插件配合，完成JS依赖项的合并、加载