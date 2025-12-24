// mermaid-renderer.js
// 简单导出版本

let timer;
function debouncedRunloop(fn) {
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, 0);
  }
}

// 导出初始化函数
export function initializeMermaidRenderer() {
  (function () {
    const vscode = acquireVsCodeApi();
    const preview = document.getElementById('preview');
    const body = document.querySelector('body');

    const DEFAULT_STATE = {
      scale: 1.0,
      code: preview.textContent,
      configuration: JSON.stringify(mermaid.mermaidAPI.getSiteConfig()),
      backgroundColor: undefined,
      scrollTop: 0,
      scrollLeft: 0
    };

    function setState(state) {
      const current = vscode.getState();
      vscode.setState({
        ...current,
        ...state
      });
    }

    function getState() {
      const prevState = vscode.getState();
      if (!prevState) {
        setState(DEFAULT_STATE);
        return DEFAULT_STATE;
      }
      return prevState;
    }

    function zoom(value) {
      const style = preview.style;
      style.transform = `scale(${value})`;
      style.transformOrigin = 'left top';
    }

    function convertToImg(
      svgBase64,
      type,
      scale,
      quality,
      toClipboard,
      callback
    ) {
      if (type === 'svg' && !toClipboard) {
        callback(svgBase64, undefined);
        return;
      }

      const elem = document.createElement('canvas');
      elem.setAttribute('style', 'display: none;');
      elem.setAttribute('id', 'cnvs');
      preview.parentNode.appendChild(elem);
      elem.focus();

      const canvas = document.getElementById('cnvs');
      const ctx = canvas.getContext('2d');

      const imgSrc = `data:image/svg+xml;charset=utf-8;base64,${svgBase64}`;
      const img = new Image();
      img.onerror = function () {
        callback(undefined, new Error('Failed to load imgSrc in Image object.'));
      };
      img.onload = function () {
        const calcedWidth = img.width * scale;
        const calcedHeight = img.height * scale;
        elem.setAttribute('width', calcedWidth);
        elem.setAttribute('height', calcedHeight);
        ctx.drawImage(img, 0, 0, calcedWidth, calcedHeight);

        if (toClipboard) {
          canvas.toBlob(blob => {
            const data = [new ClipboardItem({ [blob.type]: blob })];
            callback(data, undefined);
          });
        } else {
          const mimeType = type === 'jpg' ? 'image/jpeg' : `image/${type}`;
          callback(
            canvas
              .toDataURL(mimeType, quality)
              .replace(new RegExp(`^data:${mimeType};base64,`), ''),
            undefined
          );
        }
        canvas.parentNode.removeChild(canvas);
      };
      img.src = imgSrc;
    }

    function postParseError(error) {
      vscode.postMessage({
        command: 'onParseError',
        error
      });
    }

    function postOnTakeImage(type, data) {
      vscode.postMessage({
        command: 'onTakeImage',
        data,
        type
      });
    }

    function postOnCopyImage() {
      vscode.postMessage({
        command: 'onCopyImage'
      });
    }

    function postFailTakeImage(error) {
      vscode.postMessage({
        command: 'onFailTakeImage',
        error
      });
    }

    function render(code, configuration, backgroundColor) {
      try {
        mermaid.parse(code);
        mermaid.initialize(JSON.parse(configuration));
      } catch (error) {
        postParseError(error);
        return;
      }

      body.style.backgroundColor = backgroundColor;

      preview.textContent = code;
      preview.removeAttribute('data-processed');
      mermaid.init();
    }

    // exportAsSVG
    function exportAsSVG(svgElement, bgColor) {
      try {
        // 获取SVG的尺寸
        const bbox = svgElement.getBBox();
        const width = bbox.width + bbox.x;
        const height = bbox.height + bbox.y;

        // 创建新的SVG
        const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        newSvg.setAttribute('width', width);
        newSvg.setAttribute('height', height);
        newSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        // 创建foreignObject来包含原始SVG
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('width', '100%');
        foreignObject.setAttribute('height', '100%');

        // 克隆原始SVG
        const svgClone = svgElement.cloneNode(true);
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '100%');

        // 创建div来包裹SVG
        const div = document.createElement('div');
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.appendChild(svgClone);

        // 复制所有样式
        const styleSheets = Array.from(document.styleSheets)
          .filter(sheet => {
            try { return sheet.cssRules; }
            catch (e) { return false; }
          })
          .map(sheet => {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');
          })
          .join('\n');

        const style = document.createElement('style');
        style.textContent = styleSheets;
        div.appendChild(style);

        foreignObject.appendChild(div);
        newSvg.appendChild(foreignObject);

        //backgroundColor
        if (bgColor && bgColor !== 'transparent') {
          newSvg.style.backgroundColor = bgColor;
        }
        //
        const svgString = new XMLSerializer().serializeToString(newSvg);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
        // const svgUrl = URL.createObjectURL(svgBlob);

        return svgString;

      } catch (error) {
        console.error('导出SVG出错:', error);
        console.error('导出SVG出错:', error.message);
        return "";
      }
    }


    // init
    function init() {
      const state = getState();
      zoom(state.scale);
      if (preview.textContent.trim() === '') {
        preview.textContent = state.code;
      }

      if (state.backgroundColor) {
        body.style.backgroundColor = state.backgroundColor;
      }
      debouncedRunloop(() => {
        window.scrollBy(state.scrollLeft, state.scrollTop);
      });
    }
    init();

    // callbacks
    window.addEventListener('error', () => {
      try {
        mermaid.parse(preview.textContent);
      } catch (error) {
        postParseError(error);
        preview.textContent = '';
      }
    });

    window.addEventListener('message', event => {
      const message = event.data;
      const state = getState();
      switch (message.command) {
        case 'update':
          const { code, configuration, backgroundColor } = message;
          render(code, configuration, backgroundColor);

          debouncedRunloop(() => {
            window.scrollBy(state.scrollLeft, state.scrollTop);
          });
          setState({
            code,
            configuration: JSON.stringify(mermaid.mermaidAPI.getSiteConfig()),
            backgroundColor
          });
          return;
        case 'takeImage':
          const { type, scale, quality, target } = message;

          const bgColor = getComputedStyle(body).backgroundColor;
          const svg = preview.querySelector('svg');

          // if (bgColor && bgColor !== 'transparent') {
          //   svg.style.backgroundColor = bgColor;
          // }
          // const xml = new XMLSerializer().serializeToString(svg);

          const xml = exportAsSVG(svg, bgColor);

          const data = btoa(unescape(encodeURIComponent(xml)));

          const toClipboard = target === 'clipboard';
          convertToImg(
            data,
            type,
            scale,
            quality,
            toClipboard,
            (imgData, error) => {
              if (toClipboard) {
                navigator.clipboard
                  .write(imgData)
                  .then(postOnCopyImage, postFailTakeImage);
              } else {
                error ? postFailTakeImage(error) : postOnTakeImage(type, imgData);
              }
            }
          );
          return;
        case 'zoomTo':
          const { value } = message;
          zoom(value);
          render(state.code, state.configuration, state.backgroundColor);

          setState({ scale: value });
          return;
      }
    });

    window.onscroll = function () {
      if (!timer) {
        const { scrollTop, scrollLeft } = document.documentElement;
        setState({ scrollTop, scrollLeft });
      }
    };
  })();
}

// 导出默认函数
export default initializeMermaidRenderer;