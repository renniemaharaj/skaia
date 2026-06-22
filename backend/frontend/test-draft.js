let prev = { title: "Title", content: "Content", categoryId: "Cat" };
let newContent = "New Content";
let next = { title: prev?.title || "", content: newContent, categoryId: prev?.categoryId || "" };
console.log(next);
