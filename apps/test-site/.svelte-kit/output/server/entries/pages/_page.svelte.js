import { a6 as ssr_context, a7 as attr_class, e as escape_html, a5 as derived, a8 as ensure_array_like, a9 as store_get, aa as unsubscribe_stores, ab as attr } from "../../chunks/index.js";
import { p as public_env } from "../../chunks/shared-server.js";
import { w as writable } from "../../chunks/index2.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
const initial$1 = {
  messages: [],
  connected: false,
  sessionId: null,
  loading: false
};
const chat = writable(initial$1);
function disconnect() {
  chat.set(initial$1);
}
function ChatBubble($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { message } = $$props;
    const isUser = derived(() => message.role === "user");
    const isSystem = derived(() => message.role === "system");
    const timeStr = derived(() => new Date(message.timestamp).toLocaleTimeString());
    $$renderer2.push(`<div${attr_class("chat-bubble svelte-1747e8f", void 0, {
      "user": isUser(),
      "assistant": !isUser() && !isSystem(),
      "system": isSystem()
    })}><div class="bubble-content">${escape_html(message.content)}</div> <div class="bubble-time svelte-1747e8f">${escape_html(timeStr())}</div></div>`);
  });
}
function MessageList($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    $$renderer2.push(`<div class="message-list svelte-10g9fdo"><!--[-->`);
    const each_array = ensure_array_like(store_get($$store_subs ??= {}, "$chat", chat).messages);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let message = each_array[$$index];
      ChatBubble($$renderer2, { message });
    }
    $$renderer2.push(`<!--]--> `);
    if (store_get($$store_subs ??= {}, "$chat", chat).loading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="typing-indicator svelte-10g9fdo"><span class="svelte-10g9fdo"></span><span class="svelte-10g9fdo"></span><span class="svelte-10g9fdo"></span></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function MessageInput($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let input = "";
    $$renderer2.push(`<form class="message-input svelte-p5wjeo"><textarea${attr("placeholder", store_get($$store_subs ??= {}, "$chat", chat).connected ? "Type a message..." : "Connecting...")}${attr("disabled", !store_get($$store_subs ??= {}, "$chat", chat).connected, true)}${attr("rows", 1)} class="svelte-p5wjeo">`);
    const $$body = escape_html(input);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea> <button type="submit"${attr("disabled", !store_get($$store_subs ??= {}, "$chat", chat).connected || !input.trim(), true)} class="svelte-p5wjeo">Send</button></form>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function ChatWidget($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    onDestroy(() => {
      disconnect();
    });
    $$renderer2.push(`<div class="chat-widget svelte-1aadu32"><div class="chat-header svelte-1aadu32"><span class="chat-title svelte-1aadu32">quant.bot</span> <span${attr_class("status-dot svelte-1aadu32", void 0, {
      "connected": store_get($$store_subs ??= {}, "$chat", chat).connected
    })}></span></div> `);
    MessageList($$renderer2);
    $$renderer2.push(`<!----> `);
    MessageInput($$renderer2);
    $$renderer2.push(`<!----></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
const initial = {
  token: null,
  address: null,
  userId: null,
  authenticated: false
};
const auth = writable(initial);
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const gatewayUrl = public_env.PUBLIC_GATEWAY_URL ?? "http://localhost:3000";
    gatewayUrl.replace(/^http/, "ws");
    $$renderer2.push(`<div class="page svelte-1uha8ag">`);
    if (store_get($$store_subs ??= {}, "$auth", auth).authenticated) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="status-bar svelte-1uha8ag"><span class="addr svelte-1uha8ag">${escape_html(store_get($$store_subs ??= {}, "$auth", auth).address?.slice(0, 6))}...${escape_html(store_get($$store_subs ??= {}, "$auth", auth).address?.slice(-4))}</span> <button class="btn btn-sm svelte-1uha8ag">Disconnect</button></div> <div class="chat-container svelte-1uha8ag">`);
      ChatWidget($$renderer2, {
        config: {
          token: store_get($$store_subs ??= {}, "$auth", auth).token ?? void 0
        }
      });
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="card svelte-1uha8ag"><p class="hint svelte-1uha8ag">Connect your wallet to get started</p> <button class="btn svelte-1uha8ag">Connect Wallet</button></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
