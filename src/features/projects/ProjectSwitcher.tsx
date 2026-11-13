import { token, Image, Scroll, Text, View, type Accessor } from "nsh";
import { Tab, Tabs } from "nsh/base";
import projectIcon from "../../../assets/project.svg";
import type { Project } from "../../api/client";

interface ProjectSwitcherProps {
  projects: Accessor<Project[]>;
  selected: Accessor<string | undefined>;
  onSelect: (project: string) => void;
  status: Accessor<string>;
  onRefresh: () => void;
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
  return <View class="bg-titlebar">
    <View testID="project-bar" class="h-11 px-3 flex-row items-center gap-3 bg-surface"
      style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
      <Image src={projectIcon} class="h-4 w-4" style={{ tintColor: token("muted-foreground") }} />
      <Text class="text-[13px] font-normal text-muted-foreground">项目</Text>
      <Scroll horizontal class="flex-1 h-8">
        <Tabs class="h-8 flex-row items-center gap-1">
          <Each of={props.projects()} key={project => project.id}>{project =>
            <Tab testID={`project-tab-${project().id}`} selected={props.selected() === project().id}
              onPress={() => props.onSelect(project().id)}
              class={props.selected() === project().id
                ? "h-7 px-3 rounded-lg bg-accent flex-row items-center gap-2"
                : "h-7 px-3 rounded-lg hover:bg-accent flex-row items-center gap-2"}>
              <View class="h-1 w-1">
                <If when={props.selected() === project().id}>
                  <View testID={`project-selected-${project().id}`} class="h-1 w-1 rounded-full bg-primary" />
                </If>
              </View>
              <Text class="text-[13px] font-normal text-foreground">{project().name}</Text>
            </Tab>
          }</Each>
        </Tabs>
      </Scroll>
      <If when={props.projects().length === 0}>
        <Text class="text-xs text-quiet">{props.status()}</Text>
      </If>
      <View testID="refresh-projects" role="button" accessibilityLabel="刷新项目" onPress={props.onRefresh}
        class="h-7 px-2 justify-center rounded hover:bg-accent">
        <Text class="text-xs text-muted-foreground">刷新</Text>
      </View>
    </View>
  </View>;
}
