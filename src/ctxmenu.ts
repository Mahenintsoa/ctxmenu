/*! ctxMenu v1.1.1 | (c) Nikolaj Kappler | https://github.com/nkappler/ctxmenu/blob/master/LICENSE !*/

declare const css: any;

/** This is a Divider Menu Item */
export interface CTXMDivider {
    isDivider: true;
}

/**
 * This is a heading item which displays a text and optionally shows a tooltip when hovering over it.
 *
 * NOTE: _All other menu items (except the divider item) derive from this and have at least these two properties_
 */
export interface CTXMHeading {
    /** The text of the Context Menu Item */
    text: string;
    /** The tooltip of the Context Menu Item */
    tooltip?: string;
}

export interface CTXMInteractive extends CTXMHeading {
    /** Whether the Context Menu Item is disabled or not. Defaults to `false` */
    disabled?: boolean;
}

/** This is an interactive item which will execute a given javascript function when clicked. */
export interface CTXMAction extends CTXMInteractive {
    /** A function that is called when the Action Item is clicked. Takes a `MouseEvent` as parameter. */
    action: (ev: MouseEvent) => void;
}

/** This is an interactive item which implements an anchor tag (`<a>`) and will redirect to a given URL (`href`). */
export interface CTXMAnchor extends CTXMInteractive {
    /** Contains a URL or a URL fragment that the hyperlink points to. */
    href: string;
    /** Specifies where to display the linked URL. (e.g. `"_blank"` to open it in a new tab) */
    target?: string;
}

/** This is an interactive item which holds a menu definition. You can create infinitely deep nested submenus. */
export interface CTXMSubMenu extends CTXMInteractive {
    /** The menu definition for the nested menu */
    subMenu: CTXMenu;
}

export type CTXMItem = CTXMAnchor | CTXMAction | CTXMHeading | CTXMDivider | CTXMSubMenu;

/**
 * This is a Menu Definition. In fact, it's just an array of Context Menu Items
 */
export type CTXMenu = CTXMItem[];

/**
 * A function that is called before the context menu is opened.
 * It is passed the menu definition and the MouseEvent.
 * Can be used to manipulate the menu based on the Event. (e.g. Cursor Position)
 * Needs to return a menu definition.
 */
export type BeforeRenderFN = (menu: CTXMenu, e: MouseEvent) => CTXMenu;

export interface CTXMenuSingleton {
    /**
     * The attach method is used to bind a context menu to any DOM Node and takes the following arguments:
     * @param target A selector string to define the target node (eg `'body'`, or `'#someID'`)
     * @param ctxMenu An array of objects defining the menu layout.
     * @param beforeRender An optional callback function that is called before the context menu is opened.
     * It is passed two arguments:
     * `menu` - the menu definition,
     * `event` - the MouseEvent.
     * `beforeRender` needs to return a new menu definition which will be used.
     */
    attach(target: string, ctxMenu: CTXMenu, beforeRender?: BeforeRenderFN): void;
    /**
     * The update method is used to update an existing context menu.
     * You can update each the menu definition or beforeRender function only by passing undefined for the other argument.
     * If you try to update a menu which does not exist, it will silently be attached instead.
     * @param target A selector string to define the target node (eg `'body'`, or `'#someID'`)
     * @param ctxMenu An array of objects defining the updated menu layout. _(might be undefined when only updating beforeRender)_
     * @param beforeRender The updated callback function that is called before the context menu is opened.
     * It is passed two arguments:
     * `menu` - the menu definition,
     * `event` - the MouseEvent.
     * `beforeRender` needs to return a new menu definition which will be used.
     */
    update(target: string, ctxMenu?: CTXMenu, beforeRender?: BeforeRenderFN): void;
    /**
     * The delete method is used to delete a context menu
     * @param target A selector string to define the target node (eg `'body'`, or `'#someID'`)
     */
    delete(target: string): void;
}

type CTXHandler = Exclude<HTMLElement["oncontextmenu"], null>;

interface CTXCache {
    [key: string]: {
        ctxmenu: CTXMenu,
        handler: CTXHandler,
        beforeRender: BeforeRenderFN
    } | undefined;
}

interface Pos {
    x: number;
    y: number;
}

class ContextMenu implements CTXMenuSingleton {
    private static instance: ContextMenu;
    private menu: HTMLUListElement | undefined;
    private cache: CTXCache = {};
    private dir: "r" | "l" = "r";
    private constructor() {
        window.addEventListener("click", () => this.closeMenu());
        window.addEventListener("resize", () => this.closeMenu());
        window.addEventListener("scroll", () => this.closeMenu());
        ContextMenu.addStylesToDom();
    }

    public static getInstance() {
        if (!ContextMenu.instance) {
            ContextMenu.instance = new ContextMenu();
        }
        return ContextMenu.instance;
    }

    public attach(target: string, ctxMenu: CTXMenu, beforeRender: BeforeRenderFN = m => m) {
        const t = document.querySelector<HTMLElement>(target);
        if (this.cache[target] !== undefined) {
            console.error(`target element ${target} already has a context menu assigned. Use ContextMenu.update() intstead.`);
            return;
        }
        if (!t) {
            console.error(`target element ${target} not found`);
            return;
        }
        const handler: CTXHandler = e => {
            e.stopImmediatePropagation();
            //close any open menu
            this.closeMenu();

            //reset direction
            this.dir = "r";

            const newMenu = beforeRender([...ctxMenu], e);
            this.menu = this.generateDOM(newMenu, e);
            document.body.appendChild(this.menu);

            e.preventDefault();
        };

        this.cache[target] = {
            ctxmenu: ctxMenu,
            handler,
            beforeRender
        };
        t.addEventListener("contextmenu", handler);
    }

    public update(target: string, ctxMenu?: CTXMenu, beforeRender?: BeforeRenderFN) {
        const o = this.cache[target];
        const t = document.querySelector<HTMLElement>(target);
        o && t && t.removeEventListener("contextmenu", o.handler);
        delete this.cache[target];
        this.attach(target, ctxMenu || o && o.ctxmenu || [], beforeRender || o && o.beforeRender);
    }

    public delete(target: string) {
        const o = this.cache[target];
        if (!o) {
            console.error(`no context menu for target element ${target} found`);
            return;
        }
        const t = document.querySelector<HTMLElement>(target);
        if (!t) {
            console.error(`target element ${target} does not exist (anymore)`);
            return;
        }
        t.removeEventListener("contextmenu", o.handler);
        delete this.cache[target];
    }

    private closeMenu(menu: Element | undefined = this.menu) {
        if (menu) {
            if (menu === this.menu) {
                delete this.menu;
            }
            const p = menu.parentElement;
            p && p.removeChild(menu);
        }
    }

    /**
     * assigns an eventhandler to a list item, that gets triggered after a short timeout,
     * but only if the cursor is still targeting that list item after the timeout. when
     * hovering fast over different list items, the actions do not get triggered.
     * @param target the target list item
     * @param action the event that should trigger after the timeout
     */
    private debounce(target: HTMLLIElement, action: (e: MouseEvent) => void) {
        let timeout: number;
        target.addEventListener("mouseenter", (e) => {
            timeout = setTimeout(() => action(e), 150);
        });
        target.addEventListener("mouseleave", () => clearTimeout(timeout));
    }

    private generateDOM(ctxMenu: CTXMenu, event: MouseEvent): HTMLUListElement;
    private generateDOM(ctxMenu: CTXMenu, parentElement: HTMLLIElement): HTMLUListElement;
    private generateDOM(ctxMenu: CTXMenu, parentOrEvent: HTMLLIElement | MouseEvent): HTMLUListElement {
        const container = document.createElement("ul");
        if (ctxMenu.length === 0) {
            container.style.display = "none";
        }
        ctxMenu.forEach(item => {
            const li = document.createElement("li");
            //all items shoud have a handler to close submenus on hover (except if its their own)
            this.debounce(li, () => {
                const subMenu = li.parentElement && li.parentElement.querySelector("ul");
                if (subMenu && subMenu.parentElement !== li) {
                    this.closeMenu(subMenu);
                }
            });

            //Item type specific stuff
            if (ContextMenu.itemIsDivider(item)) {
                li.className = "divider";
            } else {
                li.innerHTML = `<span>${item.text}</span>`;
                li.title = item.tooltip || "";
                if (ContextMenu.itemIsInteractive(item)) {
                    if (!item.disabled) {
                        li.className = "interactive";
                        if (ContextMenu.itemIsAction(item)) {
                            li.addEventListener("click", item.action);
                        }
                        else if (ContextMenu.itemIsAnchor(item)) {
                            li.innerHTML = `<a href="${item.href}" ${item.target ? 'target="' + item.target + '"' : ""}>${item.text}</a>`;
                        }
                        else {
                            if (item.subMenu.length === 0) {
                                li.className = "disabled submenu";
                            } else {
                                li.className = "interactive submenu";
                                this.debounce(li, (ev) => {
                                    const subMenu = li.querySelector("ul");
                                    if (!subMenu) { //if it's already open, do nothing
                                        this.openSubMenu(ev, item.subMenu, li);
                                    }
                                });
                            }
                        }
                    } else {
                        li.className = "disabled";
                        if (ContextMenu.itemIsSubMenu(item)) {
                            li.className = "disabled submenu";
                        }
                    }
                } else {
                    //Heading
                    li.style.fontWeight = "bold";
                    li.style.marginLeft = "-5px";
                }
            }
            container.appendChild(li);
        });
        container.style.position = "fixed";
        container.className = "ctxmenu";

        const rect = ContextMenu.getBounding(container);
        let pos = { x: 0, y: 0 };
        if (parentOrEvent instanceof Element) {
            const parentRect = parentOrEvent.getBoundingClientRect();
            pos = {
                x: this.dir === "r" ? parentRect.left + parentRect.width : parentRect.left - rect.width,
                y: parentRect.top - 4
            };
            //change direction when reaching edge of screen
            if (pos.x !== this.getPosition(rect, pos).x) {
                this.dir = this.dir === "r" ? "l" : "r";
                pos.x = this.dir === "r" ? parentRect.left + parentRect.width : parentRect.left - rect.width;
            }
        } else {
            pos = this.getPosition(rect, { x: parentOrEvent.clientX, y: parentOrEvent.clientY });
        }

        container.style.left = pos.x + "px";
        container.style.top = pos.y + "px";
        container.addEventListener("contextmenu", ev => {
            ev.stopPropagation();
            ev.preventDefault();
        });
        container.addEventListener("click", ev => {
            const item = ev.target && (ev.target as Element).parentElement;
            if (item && item.className !== "interactive") {
                ev.stopPropagation();
            }
        });
        return container;
    }

    private openSubMenu(e: MouseEvent, ctxMenu: CTXMenu, listElement: HTMLLIElement) {
        // check if other submenus on this level are open and close them
        const subMenu = listElement.parentElement && listElement.parentElement.querySelector("li > ul");
        if (subMenu && subMenu.parentElement !== listElement) {
            this.closeMenu(subMenu);
        }
        listElement.appendChild(this.generateDOM(ctxMenu, listElement));
    }

    private static getBounding(elem: HTMLElement): ClientRect | DOMRect {
        const container = elem.cloneNode(true) as HTMLElement;
        container.style.visibility = "hidden";
        document.body.appendChild(container);
        const result = container.getBoundingClientRect();
        document.body.removeChild(container);
        return result;
    }

    private getPosition(rect: DOMRect | ClientRect, pos: Pos): Pos {
        return {
            x: this.dir === "r"
                ? pos.x + rect.width > window.innerWidth ? window.innerWidth - rect.width : pos.x
                : pos.x < 0 ? 0 : pos.x,
            y: pos.y + rect.height > window.innerHeight ? window.innerHeight - rect.height : pos.y
        };
    }

    private static itemIsInteractive(item: CTXMItem): item is (CTXMAction | CTXMAnchor | CTXMSubMenu) {
        return this.itemIsAction(item) || this.itemIsAnchor(item) || this.itemIsSubMenu(item);
    }

    private static itemIsAction(item: CTXMItem): item is CTXMAction {
        return item.hasOwnProperty("action");
    }

    private static itemIsAnchor(item: CTXMItem): item is CTXMAnchor {
        return item.hasOwnProperty("href");
    }

    private static itemIsDivider(item: CTXMItem): item is CTXMDivider {
        return item.hasOwnProperty("isDivider");
    }

    private static itemIsSubMenu(item: CTXMItem): item is CTXMSubMenu {
        return item.hasOwnProperty("subMenu");
    }

    private static addStylesToDom() {
        const append = () => {
            //insert default styles as first css -> low priority -> user can overwrite it easily
            const styles = document.createElement("style");
            styles.innerHTML =
                css`.ctxmenu {
                        border: 1px solid #999;
                        padding: 2px 0;
                        box-shadow: 3px 3px 3px #aaa;
                        background: #fff;
                        margin: 0;
                        font-size: 15px;
                        font-family: Verdana, sans-serif;
                        z-index: 9999;
                    }
                    .ctxmenu li {
                        margin: 1px 0;
                        display: block;
                        position: relative;
                    }
                    .ctxmenu li span, .ctxmenu li a {
                        display: block;
                        padding: 2px 20px;
                        cursor: default;
                    }
                    .ctxmenu li a {
                        color: inherit;
                        text-decoration: none;
                    }
                    .ctxmenu li.disabled {
                        color: #ccc;
                    }
                    .ctxmenu li.divider {
                        border-bottom: 1px solid #aaa;
                        margin: 5px 0;
                    }
                    .ctxmenu li.interactive:hover {
                        background: rgba(0,0,0,0.1);
                    }
                    .ctxmenu li.submenu::after {
                        content: '>';
                        position: absolute;
                        display: block;
                        top: 0;
                        right: 0.3em;
                        font-family: monospace;
                        line-height: 22px;
                    }
                `;
            document.head.insertBefore(styles, document.head.childNodes[0]);
        };

        if (document.readyState === "interactive") {
            append();
        } else {
            document.addEventListener("readystatechange", () => {
                if (document.readyState === "interactive") {
                    append();
                }
            });
        }
    }
}

export const ctxmenu: CTXMenuSingleton = ContextMenu.getInstance();


