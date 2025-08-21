const Config = {
  Prefix: 'U',
};

function log(...args: any[]) {
  console.log.call(console, `[Components2Code]`, ...args);
}
// 显示UI界面
figma.showUI(__html__, {
  width: 500,
  height: 650,
  title: 'Components2Code',
});

// 监听选择变化
figma.on('selectionchange', () => {
  updateSelection();
});

// 监听UI消息
figma.ui.onmessage = (msg) => {
  switch (msg.type) {
    case 'init':
    case 'refresh':
      updateSelection();
      break;
    case 'generateData':
      generateData();
      break;
  }
};

// 更新选择信息
function updateSelection() {
  const selection = figma.currentPage.selection;

  // 简化节点信息用于UI显示
  const simplifiedSelection = selection.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  }));

  figma.ui.postMessage({
    type: 'selectionUpdate',
    selection: simplifiedSelection,
  });
}

// 生成JSON数据
async function generateData() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'error',
      error: '请先选择至少一个节点',
    });
    return;
  }

  try {
    // log('selection', selection);
    const jsonData = await nodeToJson(selection);
    log('json data', jsonData);

    const componentData = filterComponentData(jsonData);
    log('component data', componentData);

    const html = componentDataToHtml(componentData);

    figma.ui.postMessage({
      type: 'dataResult',
      data: html,
    });
  } catch (error: any) {
    figma.ui.postMessage({
      type: 'error',
      error: `生成JSON失败: ${error.message}`,
    });
  }
}
// 将字符串转换为帕斯卡命名（PascalCase）
function toPascalCase(str: string): string {
  // 统一处理各种命名格式：驼峰、帕斯卡、连字符、下划线等
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/([a-zA-Z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+|[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

async function formatProperties(
  ins: InstanceNode | ComponentNode | ComponentSetNode
) {
  const props = {} as Record<string, string | boolean>;
  if (ins.type !== 'INSTANCE') return props;

  let defProps: Record<string, string | boolean> | undefined;
  try {
    const main = await ins?.getMainComponentAsync?.();
    const def = main?.componentPropertyDefinitions || {};
    defProps = {} as Record<string, string | boolean>;
    Object.keys(def).forEach((key) => {
      const realKey = String(key).split('#').shift()!;
      defProps![realKey] = def[key].defaultValue;
    });
  } catch (error) {
    defProps = undefined;
  }

  const properties = ins?.componentProperties || {};

  Object.keys(properties).map(async (key) => {
    if (isIgnore(key)) return;
    let v = properties[key].value;
    key = String(key).split('#').shift()!;
    if (!defProps && 'default,none,off,basic,false'.includes(v + '')) return;
    if (defProps && v === defProps[key]) return;
    if (v === 'true' || v === 'false') v = v === 'true';
    props[key] = v;
  });

  return props;
}
/**
 * 1. 组件数据转换为HTML字符串
 * 2. 处理嵌套
 * 3. 处理组件属性
 * 4. 处理缩进，每下钻一层，缩进增加2个空格
 * @param data
 * @param indent 缩进空格数
 * @returns
 */
function componentDataToHtml(data: NodeData[], indent = 0) {
  let html = '';
  const hold = (n = 0) => `\n${' '.repeat(indent + n)}`;
  data.forEach((item) => {
    let tag = item.dataType as any;
    const props = { ...(item.properties || {}) };

    if (item.dataType === 'component') {
      if (isTemplate(item)) tag = 'template';
      else {
        const name = toPascalCase(item.name);
        const isStartsWithPrefix = name
          .toLowerCase()
          .startsWith(Config.Prefix.toLowerCase());
        tag = isStartsWithPrefix ? name : Config.Prefix + name;
      }
    } else if (item.dataType === 'div') {
      props.class = item.name;
    }
    html += `${hold()}<${tag}`;

    const propKeys = Object.keys(props);
    propKeys.forEach((key) => {
      const value = props[key];
      const isBool = typeof value === 'boolean';
      if (tag === 'template' && key === 'slot') {
        html += `${hold(2)}#${value}`;
      } else {
        html += `${hold(2)}${isBool ? ':' : ''}${key}="${value}"`;
      }
    });

    if (item.children?.length) {
      if (propKeys.length) html += hold();
      html += `>`;
      html += componentDataToHtml(item.children, indent + 2);
      html += `${hold()}</${tag}>`;
    } else {
      if (propKeys.length) html += hold();
      if (item.text) {
        html += `>${item.text}</${tag}>`;
      } else {
        html += `/>`;
      }
    }
  });
  return html;
}

// 不是字母开头的名称
const isIgnore = (name: string) => {
  if (name.startsWith('_')) {
    return true;
  }
  if (name.includes('Instance')) {
    return true;
  }
  return false;
};

// 过滤组件数据
function filterComponentData(jsonData?: NodeData[], fromCom = false) {
  if (!jsonData?.length) return [];
  const componentData: NodeData[] = [];
  // 不是组件，在子元素中有是组件的，升级保留
  const upgradeComponentData: NodeData[] = [];
  const len = jsonData ? jsonData.length : 0;
  for (let i = 0; i < len; i++) {
    const node = jsonData[i];
    if (!node.visible || isIgnore(node.name)) {
      continue;
    }
    const isCom = node.dataType === 'component';

    const children = filterComponentData(node.children, isCom || fromCom);

    if (isCom) {
      const isTpl = isTemplate(node);
      const isDefTpl = isTpl && !node.properties?.slot;
      const isRef = node.name.includes('reference');
      if (isRef || isDefTpl) {
        // 升级
        if (children?.length) {
          upgradeComponentData.push(...children);
        }
        continue
      }

      const isUCom = /^u|U/.test(node.name);
      if (isUCom) {
        componentData.push({ ...node, children });
        continue
      }
    } else {
      if (fromCom) continue
      if (node.dataType === 'span') {
        // log('span', node);
        // componentData.push({ ...node });
      }
      if (node.dataType === 'div') {
        componentData.push({ ...node, children });
      }
    }
  }

  return [...componentData, ...upgradeComponentData];
}

interface NodeData {
  dataType?: 'span' | 'div' | 'component';
  id: string;
  name: string;
  type: SceneNode['type'];
  visible: boolean;
  mainComponent?: {
    id: string;
    name: string;
  };
  properties?: Record<string, string | boolean>;
  children?: NodeData[];
  text?: string;
}

function isTemplate(node: SceneNode | NodeData): boolean {
  return node.name.toLowerCase() === 'template';
}

// 将节点转换为JSON对象
async function nodeToJson(nodes: readonly SceneNode[]): Promise<NodeData[]> {
  const jsonData: NodeData[] = [];
  const len = nodes ? nodes.length : 0;
  for (let i = 0; i < len; i++) {
    const node = nodes[i];
    const children = await nodeToJson((node as any).children);
    const nodeData: NodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      children,
    };
    switch (node.type) {
      case 'TEXT':
        nodeData.dataType = 'span';
        nodeData.text = (node as TextNode).characters;
        // log('span', node);
        break;
      case 'SECTION':
      case 'FRAME':
      case 'GROUP':
      case 'RECTANGLE':
        nodeData.dataType = 'div';
        break;
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'INSTANCE':
        nodeData.dataType = 'component';
        // 获取属性
        const props = await formatProperties(node);
        const ps = children.find((it) => it.name.endsWith('_properties'));
        if (ps) {
          Object.assign(props, ps?.properties);
        }
        nodeData.properties = props;
        break;
      default:
        break;
    }
    jsonData.push(nodeData);
  }
  return jsonData;
}

// 初始化
updateSelection();
