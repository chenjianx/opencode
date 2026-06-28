declare module "*.md" {
  const content: string
  export default content
}

declare module "*.py" { // raccoon_change - allow bundled Raccoon skill scripts as text
  const content: string
  export default content
}
