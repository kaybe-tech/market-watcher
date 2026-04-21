import { mount } from "svelte"
import App from "../../options/App.svelte"
import "../popup/app.css"

const target = document.getElementById("app")
if (!target) throw new Error("missing #app element")

export default mount(App, { target })
