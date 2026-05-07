你之前的实现存在严重漏项。现在不要先写代码，先做完整审计。

请严格按以下流程执行：

1. 读取并理解所有实现依据：
   - init/requirement.md
   - init/design.md
   - reference/xuedian 目录及其客户端界面形态
   - reference/claude-code-analysis 
   - reference/deer-flow
   - 当前代码实现

2. 逐条建立“需求-实现对账矩阵”：
   - requirement/design 中每一个明确要求都必须列出
   - 特别是 client 产品形态、workspace、thread、artifact、task、team、channel、secret、runtime、approval 等 UI/功能要求
   - 每一项必须标注：
     - 需求来源：文件路径 + 行号
     - 预期行为 / UI
     - 当前实现位置：文件路径 + 行号
     - 状态：已完成 / 部分完成 / 未完成 / 实现偏离
     - 证据说明
     - 需要修改的文件

3. 特别检查客户端 UI 是否真正参考了 reference/xuedian：
   - 不允许只实现 API 或列表页就算完成
   - 不允许把“有路由/有空页面/有简单 list”算作完成
   - 必须对比 reference/xuedian 的产品形态、布局、导航、面板、交互、信息层级

4. 在审计完成前，不要写代码。
   审计完成后，先输出完整缺口列表和修复计划。
   然后按优先级逐项实现。

5. 实现时必须覆盖所有缺口，不允许跳过。
   每完成一项，要更新对账矩阵状态，并说明对应代码文件。

6. 最终验收必须包含：
   - 完整对账矩阵，所有需求项状态
   - 未完成项必须明确说明原因，不能省略
   - 运行过的测试 / typecheck / build 命令及结果
   - 客户端页面截图或浏览器验证说明
   - 对 reference/xuedian 的对比结论

重要约束：
- 不要把需求模糊化。
- 不要只做 happy path。
- 不要只看新增文件，要检查实际页面是否可用。
- 不要在没有文件路径和代码证据的情况下声称完成。
- 如果发现之前实现方向错误，直接重构，不要在错误结构上继续堆补丁。
