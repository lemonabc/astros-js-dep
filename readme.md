# astro-js-dep

解析JS组件依赖。并将依赖的JS组件列表挂载到asset.jsLibs属性上

该插件简化了组织JS依赖的方式，在页面上书写

```
    @require dialog,autocomplete...pluginX
```

通过和astros-js-process插件配合，完成JS依赖项的加载