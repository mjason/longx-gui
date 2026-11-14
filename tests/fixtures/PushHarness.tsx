import { mount, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { subscribeProject } from "../../src/api/projectPush";
import { FileTree } from "../../src/features/files/FileTree";
import { createFileTreeState } from "../../src/features/files/treeState";
import { createGitState } from "../../src/features/git/gitState";

function Harness() {
  const project = signal("p1");
  const roots = [{ name: "src", path: "src", kind: "dir", size: 0 }];
  const tree = createFileTreeState({
    serverUrl: () => "http://fixture.test",
    projectId: project,
    entries: () => roots,
    search: () => "",
  });
  let channel: Parameters<typeof subscribeProject>[0];
  let previous: typeof channel | undefined;
  const git = createGitState({
    url: () => "http://fixture.test",
    projectId: project,
    enabled: () => true,
    dirty: () => true,
    onFiles: (paths) => {
      void tree.refreshPaths(paths);
    },
    subscribe(options) {
      previous = channel;
      channel = options;
      return () => {};
    },
  });
  return (
    <View class="flex-1">
      <Text>{git.pushConnected() ? "push joined" : "push disconnected"}</Text>
      <Text>{`head:${git.status()?.head ?? ""}`}</Text>
      <Text>{`revision:${git.revision()}`}</Text>
      <Text>{`a:${git.fileRevision("src/index.ts")},b:${git.fileRevision("other.ts")}`}</Text>
      <Button
        testID="join"
        onPress={() => {
          channel.ready(true);
          channel.joined(false);
        }}
      >
        <Text>join</Text>
      </Button>
      <Button testID="git" onPress={() => channel.git()}>
        <Text>git</Text>
      </Button>
      <Button
        testID="files"
        onPress={() => {
          channel.files(["src/index.ts"]);
          channel.files(["src/index.ts"]);
        }}
      >
        <Text>files</Text>
      </Button>
      <Button
        testID="reconnect"
        onPress={() => {
          channel.ready(true);
          channel.joined(true);
        }}
      >
        <Text>reconnect</Text>
      </Button>
      <Button testID="disconnect" onPress={() => channel.ready(false)}>
        <Text>disconnect</Text>
      </Button>
      <Button testID="switch" onPress={() => project.set("p2")}>
        <Text>switch</Text>
      </Button>
      <Button testID="old-event" onPress={() => previous?.files(["src/index.ts"])}>
        <Text>old</Text>
      </Button>
      <FileTree state={tree} decoration={() => undefined} onOpen={() => {}} />
    </View>
  );
}
mount(Harness);
