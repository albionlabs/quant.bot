function _layout($$renderer, $$props) {
  let { children } = $$props;
  $$renderer.push(`<div class="layout svelte-12qhfyh"><header class="svelte-12qhfyh"><h1 class="svelte-12qhfyh">quant.bot</h1> <span class="badge svelte-12qhfyh">test site</span></header> <main class="svelte-12qhfyh">`);
  children($$renderer);
  $$renderer.push(`<!----></main></div>`);
}
export {
  _layout as default
};
