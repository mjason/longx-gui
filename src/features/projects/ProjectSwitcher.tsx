import { type Accessor, Image, Scroll, Text, token, View } from "nsh";
import { Tab, Tabs } from "nsh/base";
import projectIcon from "../../../assets/project.svg";
import type { Project } from "../../api/client";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";

interface ProjectSwitcherProps {
  projects: Accessor<Project[]>;
  selected: Accessor<string | undefined>;
  onSelect: (project: string) => void;
  status: Accessor<string>;
  onRefresh: () => void;
  onHome: () => void;
  onQuickSwitch: () => void;
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
  return (
    <View class="bg-titlebar">
      <View
        testID="project-bar"
        class="h-11 px-3 flex-row items-center gap-3 bg-surface"
        style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
      >
        <Button
          testID="projects-home"
          accessibilityLabel="项目主页"
          class="h-8 px-1 gap-2 rounded hover:bg-accent"
          onPress={props.onHome}
        >
          <Image
            src={projectIcon}
            class="h-4 w-4"
            style={{ tintColor: token("muted-foreground") }}
          />
          <Text
            class="h-5 text-[13px] font-normal text-muted-foreground"
            style={{ lineHeight: 18, textAlignVertical: "center" }}
          >
            项目
          </Text>
        </Button>
        <Scroll horizontal class="flex-1 h-8">
          <Tabs class="h-8 flex-row items-center gap-1">
            <Each of={props.projects()} key={(project) => project.id}>
              {(project) => (
                <Tab
                  testID={`project-tab-${project().id}`}
                  selected={props.selected() === project().id}
                  onPress={() => props.onSelect(project().id)}
                  class={
                    props.selected() === project().id
                      ? "h-7 px-3 rounded-lg bg-accent flex-row items-center gap-2"
                      : "h-7 px-3 rounded-lg hover:bg-accent flex-row items-center gap-2"
                  }
                >
                  <View class="h-1 w-1">
                    <If when={props.selected() === project().id}>
                      <View
                        testID={`project-selected-${project().id}`}
                        class="h-1 w-1 rounded-full bg-primary"
                      />
                    </If>
                  </View>
                  <Text class="text-[13px] font-normal text-foreground">{project().name}</Text>
                </Tab>
              )}
            </Each>
          </Tabs>
        </Scroll>
        <If when={props.projects().length === 0}>
          <Text class="text-xs text-quiet">{props.status()}</Text>
        </If>
        <Button
          testID="project-quick-switch"
          accessibilityLabel="快速切换项目"
          class="h-7 px-2 gap-1 rounded hover:bg-accent"
          disabled={!props.projects().length}
          onPress={props.onQuickSwitch}
        >
          <Icon name="search" size={14} />
          <Text class="text-xs text-muted-foreground">快速切换</Text>
        </Button>
        <View
          testID="refresh-projects"
          role="button"
          accessibilityLabel="刷新项目"
          onPress={props.onRefresh}
          class="h-7 px-2 justify-center rounded hover:bg-accent"
        >
          <Text class="text-xs text-muted-foreground">刷新</Text>
        </View>
      </View>
    </View>
  );
}
