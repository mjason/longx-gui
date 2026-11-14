import { mount, Scroll, signal, Text, View } from "nsh";
import { AppButton as Button } from "../../src/components/AppButton";
import { PresentView } from "../../src/features/threads/PresentView";
import { createThemeState } from "../../src/theme/themes";

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#dbe4c8"/><circle cx="200" cy="50" r="30" fill="#708336"/></svg>')}`;
function Harness() {
  const theme = createThemeState();
  const width = signal(500);
  return (
    <View class="flex-1 pt-12 bg-background">
      <Button
        testID="theme"
        class="h-8 px-3 self-start rounded bg-accent"
        onPress={() => theme.select(theme.current().id === "light" ? "dark" : "light")}
      >
        <Text class="text-sm text-foreground">主题</Text>
      </Button>
      <Scroll class="flex-1">
        <View
          class="p-5"
          onLayout={(event) => width.set(Math.max(1, event.bounds.size.width - 40))}
        >
          <PresentView
            id="views"
            baseUrl="http://127.0.0.1:7788"
            width={Math.min(560, width())}
            tree={{
              $type: "Card",
              title: "验证结果",
              children: [
                { $type: "Text", text: "图片和表格应该直接显示在会话中。" },
                { $type: "Image", src: image, alt: "结果图片" },
                {
                  $type: "Table",
                  columns: [{ label: "检查项" }, { label: "结果" }],
                  rows: [
                    ["类型检查", "通过"],
                    ["测试", 152],
                    ["构建", true],
                  ],
                },
                { $type: "Fact", label: "状态", value: "已完成" },
                { $type: "Markdown", value: "**详细结果**：保留原生 Markdown 能力。" },
                { component: "Caption", props: { text: "兼容组件形式" } },
                { $type: "Button", label: "测试操作", $action: { type: "test" } },
              ],
            }}
          />
        </View>
      </Scroll>
    </View>
  );
}
mount(Harness);
