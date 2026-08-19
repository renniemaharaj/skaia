import { useAtom } from "jotai";
import { Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { draftNewThreadAtom } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { FormField, ManagedForm } from "../form";
import ForumCategory from "./ForumCategory";
import "./IconButton.css";

const Editor = lazy(() => import("./Editor"));

interface CreateThreadResponse {
  id: string;
}

interface ThreadValues {
  title: string;
  content: string;
  categoryId: string;
}

const NewThread = () => {
  const [draft, setDraft] = useAtom(draftNewThreadAtom);
  const navigate = useNavigate();

  const initialValues: ThreadValues = {
    title: draft?.title ?? "",
    content: draft?.content ?? "",
    categoryId: draft?.categoryId ?? "",
  };

  return (
    <ManagedForm<ThreadValues>
      id="new-thread-form"
      title="Create New Thread"
      eyebrow="Forum"
      description="Start a discussion with the community"
      initialValues={initialValues}
      cancelTo="/forum"
      submitLabel="Create thread"
      submitDisabled={formik =>
        !formik.values.title.trim() || !formik.values.content.trim() || !formik.values.categoryId
      }
      validate={values => ({
        ...(!values.title.trim() ? { title: "Thread title is required" } : {}),
        ...(!values.content.trim() ? { content: "Thread content is required" } : {}),
        ...(!values.categoryId ? { categoryId: "Please select a category" } : {}),
      })}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          const response = await apiRequest<CreateThreadResponse>("/forum/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category_id: values.categoryId,
              title: values.title.trim(),
              content: values.content,
            }),
          });
          setDraft(null);
          navigate(`/view-thread/${response.id}`);
        } catch (error) {
          helpers.setStatus(error instanceof Error ? error.message : "Failed to create thread");
        }
      }}
    >
      {formik => {
        const updateDraft = (values: ThreadValues) => {
          setDraft({
            title: values.title,
            content: values.content,
            categoryId: values.categoryId,
          });
        };

        return (
          <>
            <FormField
              name="title"
              label="Thread title"
              help="Use a clear title that summarizes the discussion."
              placeholder="What's on your mind?"
              maxLength={255}
              autoFocus
              onChange={event => {
                void formik.setFieldValue("title", event.target.value);
                updateDraft({ ...formik.values, title: event.target.value });
              }}
            />

            <div className="form-group">
              <ForumCategory
                value={formik.values.categoryId}
                onChange={categoryId => {
                  void formik.setFieldValue("categoryId", categoryId);
                  updateDraft({ ...formik.values, categoryId });
                }}
              />
              {formik.touched.categoryId && formik.errors.categoryId && (
                <p className="managed-field__error">{formik.errors.categoryId}</p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="thread-content">Message</label>
              <p className="form-help">Add the context other members need to respond.</p>
              <Suspense
                fallback={
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: 200 }} />
                }
              >
                <div id="thread-content">
                  <Editor
                    value={formik.values.content}
                    onChange={content => {
                      void formik.setFieldValue("content", content);
                      updateDraft({ ...formik.values, content });
                    }}
                  />
                </div>
              </Suspense>
              {formik.touched.content && formik.errors.content && (
                <p className="managed-field__error">{formik.errors.content}</p>
              )}
            </div>
          </>
        );
      }}
    </ManagedForm>
  );
};

export default NewThread;
