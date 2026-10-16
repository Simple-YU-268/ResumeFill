# 0.6.0 · 下拉、地区 JSON 与日期适配

## 地区自动丰富 JSON

保存简历、保存网页补充资料、扫描或点击「整理地区与日期 JSON」时，使用打包的离线省市区词典解析明确的户籍、籍贯、现居地址文本。唯一结果自动补充层级；原始输入保留。省略信息只能从词典中的唯一行政区划关系补全，不从当前城市推断户籍。

```json
{
  "basics": {
    "hukouAddress": "南京鼓楼",
    "hukou": {
      "province": "江苏省",
      "city": "南京市",
      "county": "鼓楼区",
      "path": "江苏省 > 南京市 > 鼓楼区"
    },
    "birthday": "2000-02-29"
  }
}
```

户籍、籍贯和现居分别写入 `hukou`、`nativeRegion`、`currentResidence`；完整路径供级联，province/city/county 供分开的下拉。`_normalization` 保留原始日期、地区解析来源等元数据，不参与候选值匹配或 AI 默认请求。

只输入“鼓楼”会列出多个地区，需在提示区确认；未找到、旧数据冲突、包含街道门牌而无法严格解析时保留原文。不会静默覆盖已有冲突值。区域名称变化时可在 JSON 管理页手动修正，不能将离线历史词典当作当前完整行政登记库。

数据来自 [Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)，该项目声明使用截至 2023-06-30 的数据且不再更新。打包文件含源数据的 31 个省级区域，不含完整港澳台数据。源 URL、SHA-256、获取日期和 WTFPL 许可保存在 data/ 中。没有运行时联网查询地区，也没有上传户籍或生日。

## 下拉选择

- 原生 select、ARIA 控件以及可明确关联弹层的 Ant/Element 类下拉；通过 aria-controls/aria-owns 或本次展开的新弹层关联，不把全页第一个菜单当答案。
- 等待延迟选项和短暂稳定的候选集；禁用项不选，重复匹配停止，不相关选项不退回第一项。
- 无匹配时展示本轮真实选项，用户点击「填写并记住此选项」后填写、回读，并将映射绑定站点、表单结构、字段、JSON 路径和原始值。此映射保存在浏览器本地；不会把网站措辞替换成简历事实。
- 省市区独立下拉等待父级触发的新候选。显式 levels 规则继续支持级联整条路径。
- 「取消填写」会中止批次中的等待和后续点击，不仅仅停止计时提示。已完成的写入不会回滚。
- AI 字段匹配仍可选；本轮下拉使用本地规则或用户确认，没有接入新的 AI 选项专用接口。

## 日期不同网站如何填写

JSON 统一用 `YYYY-MM-DD`、`YYYY-MM` 或 `YYYY` 保存已有精度，兼容输入斜线、点号、中文年月日和八位日期，严格检查日期和闰年。仅有年月时不补造日期。

| 网页方式 | 本版处理 |
| --- | --- |
| 原生 date | 按 YYYY-MM-DD 写入并回读 |
| 原生 month | 使用已有年月，原 JSON 完整日期保留 |
| 可编辑文本 | 按 placeholder / data-date-format / 规则 dateFormat 转为斜线、点号、中文或数字等格式 |
| 出生年月日三个 select | 明确生日分组和 year/month/day 属性或年/月/日提示时识别，使用运行时派生 birthdayParts |
| 自定义只读日历 | 需日期面板规则，支持原生年月下拉或有界翻月、完整日期属性定位、显示值回读 |

复杂框架日历、年/月网格、滚轮、单卡轮换日期编辑器以及虚拟列表尚不能承诺自动通用支持；需要具体页面适配。本版不是任意网站自动选日期的保证。

## 日期面板规则示例

放在明确站点的 basics.fields 中，示例选择器需按实际页面替换：

```json
{
  "selector": "#birthday-picker",
  "path": "basics.birthday",
  "type": "date",
  "dateFormat": "YYYY/MM/DD",
  "readbackSelector": "#birthday-value",
  "datePanel": {
    "panelSelector": "#birthday-panel",
    "yearSelector": "select.year",
    "monthSelector": "select.month",
    "daySelector": "button.day",
    "dateAttribute": "data-date"
  }
}
```

没有原生年月下拉时可改用 headerSelector/prevSelector/nextSelector/maxMonthSteps；标题需能解析出当前年月。翻月上限默认 600，最高 1200；生日跨越多年时应优先配置年月快速选择。

## 验证与升级

新增 profile-test、controls-v06-test；同时运行原 test、answers-test、ai-test、browser-test、matching-browser-test、projects-test、extension-test。

覆盖：南京鼓楼唯一解析、鼓楼歧义确认、地区冲突保留、闰年和日期精度、实际省→市→区异步联动、五种日期填写、延迟下拉、重复候选、取消后无迟到点击、真实扩展的自动 JSON 丰富及人工选项映射复用。浏览器和接口资料均为虚构，未投递申请。外部模型、用户指定真实招聘页面和服务器持久化仍未验证。

更新扩展后刷新招聘页面，保存/整理简历，重新扫描。地区/日期的原值与转换说明随简历 JSON 导出；求职业务仍以飞书为唯一记录源。
