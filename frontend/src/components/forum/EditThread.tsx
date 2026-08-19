import type { FormikHelpers } from "formik";
import { useAtom } from "jotai";
import { Suspense, lazy, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
const Editor = lazy(() => import("./Editor"));
import ForumCategory from "./ForumCategory";
import "./IconButton.css";

import { currentThreadAtom, draftEditThreadAtom } from "../../atoms/forum";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";
import { FormField, ManagedForm } from "../form";

interface ThreadData {
  id: string;
  title: string;
  content: string;
  category_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  reply_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  is_shared: boolean;
  original_thread_id?: string;
  user_name?: string;
}

interface ThreadValues {
  title: string;
  content: string;
  categoryId: string;
}

const EditThread = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const [currentThread, setCurrentThread] = useAtom(currentThreadAtom);
  const [draft, setDraft] = useAtom(draftEditThreadAtom);

  const { subscribe, unsubscribe } = useWebSocketSync();
  const editTitle = draft?.threadId === threadId && draft?.title ? draft.title : "";
  const editContent = draft?.threadId === threadId && draft?.content ? draft.content : "";
  const selectedCategory =
    draft?.threadId === threadId && draft?.categoryId ? draft.categoryId : "";

  const setEditTitle = (title: string) =>
    setDraft(prev => ({
      title,
      content: prev?.content || "",
      categoryId: prev?.categoryId || "",
      threadId: threadId!,
    }));

  const setEditContent = (content: string) =>
    setDraft(prev => ({
      title: prev?.title || "",
      content,
      categoryId: prev?.categoryId || "",
      threadId: threadId!,
    }));

  const setSelectedCategory = (categoryId: string) =>
    setDraft(prev => ({
      title: prev?.title || "",
      content: prev?.content || "",
      categoryId,
      threadId: threadId!,
    }));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadThread = async () => {
      if (!threadId) return;
      try {
        setLoading(true);
        const response = await apiRequest<ThreadData>(`/forum/threads/${threadId}`);
        if (response) {
          setCurrentThread(response);
          // Only overwrite draft if we don't have a draft for this thread
          if (draft?.threadId !== threadId) {
            setEditTitle(response.title);
            setEditContent(response.content);
            setSelectedCategory(String(response.category_id));
          }
          setLastUpdated(response.updated_at);
          // Subscribe to thread updates to detect changes from other users
          subscribe("thread", Number(threadId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
      } finally {
        setLoading(false);
      }
    };

    loadThread();

    return () => {
      if (threadId) {
        unsubscribe("thread", Number(threadId));
      }
    };
  }, [threadId, setCurrentThread, subscribe, unsubscribe]);

  // Silently sync editor fields when the thread is updated via WebSocket
  useEffect(() => {
    if (currentThread && lastUpdated && currentThread.updated_at !== lastUpdated) {
      setEditTitle(currentThread.title);
      setEditContent(currentThread.content);
      setSelectedCategory(String(currentThread.category_id));
      setLastUpdated(currentThread.updated_at);
    }
  }, [currentThread]);

  const handleUpdateThread = async (values: ThreadValues, helpers: FormikHelpers<ThreadValues>) => {
    helpers.setStatus(undefined);
    try {
      const response = await apiRequest<ThreadData>(`/forum/threads/${threadId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: values.title.trim(),
          content: values.content,
          category_id: values.categoryId,
        }),
      });

      // Update the atom with the fresh response from backend
      if (response) {
        setCurrentThread(response);
      }

      // Clear draft on success
      setDraft(null);

      // Navigate back to the thread view
      navigate(`/view-thread/${threadId}`);
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "Failed to update thread");
    }
  };

  if (loading) {
    return (
      <div className="managed-form modal">
        <div className="modal-header">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <ManagedForm<ThreadValues>
      id="edit-thread-form"
      title="Edit Thread"
      eyebrow="Forum"
      description="Update your discussion"
      initialValues={{ title: editTitle, content: editContent, categoryId: selectedCategory }}
      enableReinitialize
      cancelTo={`/view-thread/${threadId}`}
      submitLabel="Save thread"
      submitDisabled={formik => !formik.values.title.trim() || !formik.values.content.trim()}
      validate={values => ({
        ...(!values.title.trim() ? { title: "Thread title is required" } : {}),
        ...(!values.content.trim() ? { content: "Thread content is required" } : {}),
      })}
      onSubmit={handleUpdateThread}
    >
      {formik => (
        <>
          {error && (
            <div className="managed-form__error" role="alert">
              {error}
            </div>
          )}
          <FormField
            name="title"
            label="Thread title"
            help="Use a clear title that summarizes the discussion."
            placeholder="Update title..."
            maxLength={255}
            onChange={event => {
              void formik.setFieldValue("title", event.target.value);
              setEditTitle(event.target.value);
            }}
          />
          <div className="form-group">
            <ForumCategory
              value={formik.values.categoryId}
              onChange={categoryId => {
                void formik.setFieldValue("categoryId", categoryId);
                setSelectedCategory(categoryId);
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-thread-content">Message</label>
            <p className="form-help">Update the context shown to other members.</p>
            <Suspense
              fallback={
                <div className="skeleton skeleton-text" style={{ width: "100%", height: 200 }} />
              }
            >
              <div id="edit-thread-content">
                <Editor
                  value={formik.values.content}
                  onChange={content => {
                    void formik.setFieldValue("content", content);
                    setEditContent(content);
                  }}
                />
              </div>
            </Suspense>
            {formik.touched.content && formik.errors.content && (
              <p className="managed-field__error">{formik.errors.content}</p>
            )}
          </div>
        </>
      )}
    </ManagedForm>
  );
};

export default EditThread;
