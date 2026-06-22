const prev = { title: "Title", content: "Content", categoryId: "Cat" };
const newContent = "New Content";
const next = { title: prev?.title || "", content: newContent, categoryId: prev?.categoryId || "" };
console.log(next);
