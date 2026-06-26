import { Mention } from "reactjs-tiptap-editor/mention";
import { SlashCommand } from "reactjs-tiptap-editor/slashcommand";
import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import { MentionList } from "../../ui/MentionList";

export const advancedExtensions = [
  SlashCommand,
  Mention.configure({
    suggestion: {
      items: ({ query }: { query: string }) => {
        return [{ _query: query }];
      },
      render: () => {
        let component: ReactRenderer;
        let popup: any;

        return {
          onStart: (props: any) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
            });

            if (!props.clientRect) {
              return;
            }

            popup = tippy("body", {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
            });
          },

          onUpdate(props: any) {
            component.updateProps(props);

            if (!props.clientRect) {
              return;
            }

            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          },

          onKeyDown(props: any) {
            if (props.event.key === "Escape") {
              popup[0].hide();
              return true;
            }

            return (component.ref as any)?.onKeyDown(props);
          },

          onExit() {
            if (popup?.[0]) {
              popup[0].destroy();
            }
            if (component) {
              component.destroy();
            }
          },
        };
      },
    },
  }),
];
