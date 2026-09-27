## 变更目的

<!-- 说明要解决的问题和可观察结果。 -->

## 变更类型

- [ ] Plugin Catalog
- [ ] Pack / Pack Lock
- [ ] Evidence / Host Profile
- [ ] Schema / Fixture / Validator
- [ ] Static Web
- [ ] Build / Release
- [ ] Documentation

## 实现说明

<!-- 列出修改的事实源、关键决策及未采用的方案。 -->

## 协议与兼容性

<!--
是否改变 wire format、固定 revision、组件版本或摘要？
是否需要迁移既有 Catalog、Lock、Evidence 或 Host Adapter？
不涉及时写“不涉及”。
-->

## 验证结果

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `BASE_PATH=/dsh-mojobox/ npm run build`（网站改动）
- [ ] `git diff --check`

实际命令与结果：

```text

```

## 数据与证据检查

- [ ] 未提交 `dist/`、`.cache/`、`site/public/generated/` 或其他生成物
- [ ] 未提交凭据、用户数据或本机绝对路径
- [ ] Manifest、artifact、suite 和 Host Descriptor 摘要已按需更新
- [ ] Evidence 等级与真实验证范围一致
- [ ] 没有把 fixture 或 Schema 通过描述成生产兼容或安全认证

## 未验证项与风险

<!-- 没有则写“无”。 -->

## 回退方式

<!-- 如何撤销本次目录、协议、构建或页面变化？ -->
