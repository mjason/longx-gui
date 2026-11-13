import { Image, Scroll, Text, View, type Accessor } from "nsh";
import { Tab, Tabs } from "nsh/base";
import projectIcon from "../../../assets/project.svg";

interface ProjectSwitcherProps {
  projects: number[];
  selected: Accessor<number>;
  onSelect: (project: number) => void;
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
  return <View class="bg-[#d3e3fd]">
    <View testID="project-bar" class="h-11 px-3 flex-row items-center gap-3 bg-white"
      style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
      <Image src={projectIcon} class="h-4 w-4" style={{ tintColor: "#707b8e" }} />
      <Text class="text-xs text-[#707b8e]">项目</Text>
      <Scroll horizontal class="flex-1 h-8">
        <Tabs class="h-8 flex-row items-center gap-1">
          <Each of={props.projects}>{project =>
            <Tab testID={`project-tab-${project()}`} selected={props.selected() === project()}
              onPress={() => props.onSelect(project())}
              class={props.selected() === project()
                ? "h-7 px-3 rounded-lg bg-[#edf2fa] flex-row items-center gap-2"
                : "h-7 px-3 rounded-lg hover:bg-[#f1f4f9] flex-row items-center gap-2"}>
              <View class="h-1 w-1">
                <If when={props.selected() === project()}>
                  <View testID={`project-selected-${project()}`} class="h-1 w-1 rounded-full bg-[#4779c4]" />
                </If>
              </View>
              <Text class="text-[13px] text-[#45536a]">项目 {project()}</Text>
            </Tab>
          }</Each>
        </Tabs>
      </Scroll>
    </View>
  </View>;
}
