import { Text, View } from "nsh";
import { Command, Dialog } from "nsh/base";
import type { Project } from "../../api/client";
import { Icon } from "../../components/Icon";

export function ProjectQuickSwitch(props: {
  projects: Project[];
  selected?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      testID="project-quick-dialog"
      accessibilityLabel="快速切换项目"
      onOpenChange={({ open }) => {
        if (!open) props.onClose();
      }}
      class="w-[560px] max-w-[92%] max-h-[80%] m-auto rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <Command
        testID="project-quick-command"
        accessibilityLabel="搜索并切换项目"
        autoFocus
        placeholder="输入项目名称、路径…"
        items={props.projects
          .map((project) => ({
            id: project.id,
            label: project.name,
            keywords: [project.rootPath, project.slug],
            group: project.pinned ? "置顶项目" : "项目",
            checked: project.id === props.selected,
          }))
          .sort((a, b) => Number(b.group === "置顶项目") - Number(a.group === "置顶项目"))}
        onSelect={({ id }) => props.onSelect(id)}
        onCancel={props.onClose}
        searchBarClass="px-3 py-2 border-b border-border"
        searchClass="h-9 px-2 text-sm text-foreground"
        listClass="max-h-[360px] p-2"
        itemClass="px-3 py-2 rounded focus:bg-accent hover:bg-accent"
        groupClass="px-3 py-2 text-xs text-quiet"
        empty={<Text class="p-4 text-sm text-muted-foreground">没有匹配的项目</Text>}
        renderItem={(item) => (
          <View testID={`quick-project-${item.id}`} class="flex-row items-center gap-3">
            <Icon name="folder" size={16} />
            <View class="flex-1 gap-1">
              <Text class="text-sm text-foreground" style={{ numberOfLines: 1 }}>
                {item.label}
              </Text>
              <Text class="text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>
                {props.projects.find((project) => project.id === item.id)?.rootPath}
              </Text>
            </View>
            <If when={item.checked}>
              <Text class="text-xs text-primary">当前</Text>
            </If>
          </View>
        )}
      />
    </Dialog>
  );
}
