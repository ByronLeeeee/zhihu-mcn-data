// ==UserScript==
// @name         知乎答主MCN信息显示
// @namespace    https://github.com/ByronLeeeee/zhihu-mcn-data/
// @version      1.0
// @description  获取并显示答主MCN数据
// @author       ByronLeeeee
// @match        *://www.zhihu.com/question/*
// @match        *://www.zhihu.com/people/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // GitHub配置
    const GITHUB_CONFIG = {
        owner: 'ByronLeeeee',
        repo: 'zhihu-mcn-data',
        branch: 'main',
        path: 'mcn-data.json'
    };

    // 缓存配置
    const CACHE_CONFIG = {
        key: 'mcn_data_cache',
        expirationKey: 'mcn_data_cache_expiration',
        duration: 24 * 60 * 60 * 1000
    };

    // 添加样式
    GM_addStyle(`
        .mcn-button {
            margin-left: 8px;
            padding: 2px 8px;
            font-size: 12px;
            color: #8590a6;
            background: none;
            border: 1px solid #8590a6;
            border-radius: 3px;
            cursor: pointer;
        }
        .mcn-button:hover {
            color: #76839b;
            border-color: #76839b;
        }
        .mcn-info {
            color: #999;
            font-size: 14px;
            margin-left: 5px;
        }
        .download-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 8px 16px;
            background: #0084ff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
        }
        .download-button:disabled {
            background: #ccc;
        }
        .status-message {
            position: fixed;
            bottom: 70px;
            right: 20px;
            padding: 8px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            display: none;
        }
        .export-button {
            position: fixed;
            bottom: 20px;
            right: 160px; /* 位于更新按钮左侧 */
            padding: 8px 16px;
            background: #52c41a;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
        }
        .export-button:hover {
            background: #389e0d;
        }
    `);

    // 存储正在处理的用户ID，防止重复获取
    const processingUsers = new Set();

    // 数据管理器
    const DataManager = {
        statusElement: null,
        mcnData: null,

        createStatusElement() {
            if (!this.statusElement) {
                this.statusElement = document.createElement('div');
                this.statusElement.className = 'status-message';
                document.body.appendChild(this.statusElement);
            }
        },

        showStatus(message, duration = 3000) {
            this.statusElement.textContent = message;
            this.statusElement.style.display = 'block';
            setTimeout(() => {
                this.statusElement.style.display = 'none';
            }, duration);
        },

        // 检查缓存是否有效
        isCacheValid() {
            const expiration = GM_getValue(CACHE_CONFIG.expirationKey);
            return expiration && expiration > Date.now();
        },

        // 从缓存加载数据
        loadFromCache() {
            const cachedData = GM_getValue(CACHE_CONFIG.key);
            if (cachedData) {
                this.mcnData = cachedData;
                return true;
            }
            return false;
        },

        // 保存数据到缓存
        saveToCache(data) {
            GM_setValue(CACHE_CONFIG.key, data);
            GM_setValue(CACHE_CONFIG.expirationKey, Date.now() + CACHE_CONFIG.duration);
        },

        // 从GitHub获取数据
        async fetchFromGitHub() {
            const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.path}`;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: rawUrl,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve(data);
                            } catch (e) {
                                reject(new Error('Invalid JSON data'));
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            });
        },

        // 更新MCN数据
        async updateMCNData() {
            try {
                // 从GitHub获取新数据
                const data = await this.fetchFromGitHub();

                // 合并本地数据
                const localData = {};
                const keys = GM_listValues ? GM_listValues() : [];
                keys.forEach(key => {
                    if (key !== CACHE_CONFIG.key && key !== CACHE_CONFIG.expirationKey) {
                        localData[key] = GM_getValue(key);
                    }
                });

                // GitHub数据优先，本地数据补充
                this.mcnData = { ...localData, ...data };

                // 保存到缓存
                this.saveToCache(this.mcnData);
                this.showStatus('已更新MCN数据');
                return true;
            } catch (error) {
                console.error('更新MCN数据失败:', error);
                this.showStatus('更新MCN数据失败');
                return false;
            }
        },

        // 获取MCN信息
        getMCNInfo(userId) {
            // 优先从本地存储获取
            const localInfo = GM_getValue(userId);
            if (localInfo) return localInfo;

            // 其次从缓存数据获取
            return this.mcnData?.[userId] || null;
        },

        // 添加下载按钮
        addDownloadButton() {
            const downloadButton = document.createElement('button');
            downloadButton.className = 'download-button';
            downloadButton.textContent = '更新MCN数据库';

            downloadButton.onclick = async () => {
                downloadButton.disabled = true;
                downloadButton.textContent = '更新中...';
                await this.updateMCNData();
                downloadButton.disabled = false;
                downloadButton.textContent = '更新MCN数据库';
                updateAllMCNDisplays();
            };

            document.body.appendChild(downloadButton);
        },

        // 获取所有本地存储的MCN数据
        getAllLocalData() {
            const localData = {};

            // 1. 从缓存获取数据
            const cachedData = GM_getValue(CACHE_CONFIG.key) || {};

            // 2. 从本地存储获取手动记录的数据
            if (typeof GM_listValues === 'function') {
                const keys = GM_listValues();
                keys.forEach(key => {
                    // 排除缓存相关的键
                    if (key !== CACHE_CONFIG.key &&
                        key !== CACHE_CONFIG.expirationKey) {
                        const value = GM_getValue(key);
                        if (value) {
                            localData[key] = value;
                        }
                    }
                });
            }

            // 3. 合并数据，本地数据优先
            const mergedData = { ...cachedData, ...localData };

            console.log('导出数据统计：', {
                '缓存数据条数': Object.keys(cachedData).length,
                '本地数据条数': Object.keys(localData).length,
                '合并后总条数': Object.keys(mergedData).length
            });

            return mergedData;
        },

        // 导出数据为JSON文件
        exportData() {
            const data = this.getAllLocalData();
            const dataCount = Object.keys(data).length;

            if (dataCount === 0) {
                this.showStatus('没有找到可导出的数据');
                return;
            }

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

            const a = document.createElement('a');
            a.href = url;
            a.download = `zhihu-mcn-data-${timestamp}.json`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            this.showStatus(`已导出 ${dataCount} 条MCN数据`);
        },

        // 添加导出按钮
        addExportButton() {
            const exportButton = document.createElement('button');
            exportButton.className = 'export-button';
            exportButton.textContent = '导出MCN数据';
            exportButton.onclick = () => {
                try {
                    this.exportData();
                } catch (error) {
                    console.error('导出按钮点击处理失败:', error);
                    this.showStatus('导出操作失败');
                }
            };
            document.body.appendChild(exportButton);
        }
    };

    // 获取MCN信息的函数（手动模式）
    async function fetchMCNInfo(userId, mcnButton) {
        if (processingUsers.has(userId)) {
            return;
        }

        processingUsers.add(userId);
        mcnButton.textContent = '获取中...';
        mcnButton.disabled = true;

        const tab = GM_openInTab(`https://www.zhihu.com/people/${userId}?autoOpened=true`, {
            active: false,
            insert: true
        });

        const checkInterval = setInterval(() => {
            const mcnInfo = GM_getValue(userId);
            if (mcnInfo !== undefined) {
                clearInterval(checkInterval);
                processingUsers.delete(userId);
                mcnButton.textContent = '记录MCN';
                mcnButton.disabled = false;
                updateAllMCNDisplays();
            }
        }, 500);

        setTimeout(() => {
            clearInterval(checkInterval);
            processingUsers.delete(userId);
            mcnButton.textContent = '记录MCN';
            mcnButton.disabled = false;
        }, 10000);
    };

    // 更新所有MCN显示
    function updateAllMCNDisplays() {
        const answers = document.querySelectorAll('.List-item');
        answers.forEach(answer => {
            const urlMeta = answer.querySelector('meta[itemprop="url"]');
            if (!urlMeta) return;

            const userId = urlMeta.content.split('/').pop();
            const nameElement = answer.querySelector('.AuthorInfo-name');
            if (!nameElement) return;

            // 移除旧的MCN信息
            const oldMcnInfo = nameElement.querySelector('.mcn-info');
            if (oldMcnInfo) {
                oldMcnInfo.remove();
            }

            // 添加新的MCN信息
            const mcnInfo = DataManager.getMCNInfo(userId);
            if (mcnInfo) {
                const mcnElement = document.createElement('span');
                mcnElement.className = 'mcn-info';
                mcnElement.textContent = `（MCN: ${mcnInfo}）`;
                nameElement.appendChild(mcnElement);
            }
        });
    }

    // 处理用户页面（用于手动获取MCN信息）
    function handlePeoplePage() {
        if (!window.location.pathname.startsWith('/people/')) {
            return;
        }

        const userId = window.location.pathname.split('/').pop();
        const urlParams = new URLSearchParams(window.location.search);
        const isAutoOpened = urlParams.get('autoOpened') === 'true';

        setTimeout(async () => {
            const expandButton = document.querySelector('.ProfileHeader-expandButton');
            if (expandButton) {
                expandButton.click();
            }

            setTimeout(() => {
                const mcnElements = document.querySelectorAll('.ProfileHeader-detailItem');
                let mcnInfo = '';

                for (const element of mcnElements) {
                    if (element.textContent.includes('MCN 机构')) {
                        const mcnValue = element.querySelector('.ProfileHeader-detailValue');
                        if (mcnValue) {
                            mcnInfo = mcnValue.textContent.trim();
                            // 存储到本地
                            GM_setValue(userId, mcnInfo);
                            // 同时更新缓存
                            const cachedData = GM_getValue(CACHE_CONFIG.key) || {};
                            cachedData[userId] = mcnInfo;
                            GM_setValue(CACHE_CONFIG.key, cachedData);
                            console.log('已保存MCN信息:', userId, mcnInfo);
                            break;
                        }
                    }
                }

                if (isAutoOpened) {
                    window.close();
                }
            }, 1000);
        }, 1000);
    }

    // 处理问题页面
    function handleQuestionPage() {
        if (!window.location.pathname.startsWith('/question/')) {
            return;
        }

        function processAnswer(answer) {
            if (answer.classList.contains('processed-mcn')) {
                return;
            }

            const authorInfo = answer.querySelector('.AuthorInfo');
            if (!authorInfo) return;

            const urlMeta = authorInfo.querySelector('meta[itemprop="url"]');
            if (!urlMeta) return;

            const userId = urlMeta.content.split('/').pop();
            answer.classList.add('processed-mcn');

            const nameElement = authorInfo.querySelector('.AuthorInfo-name');
            if (nameElement && !nameElement.querySelector('.mcn-button')) {
                // 创建MCN按钮
                const mcnButton = document.createElement('button');
                mcnButton.className = 'mcn-button';
                mcnButton.textContent = '记录MCN';
                mcnButton.onclick = () => fetchMCNInfo(userId, mcnButton);
                nameElement.appendChild(mcnButton);

                // 显示MCN信息
                const mcnInfo = DataManager.getMCNInfo(userId);
                if (mcnInfo) {
                    const mcnElement = document.createElement('span');
                    mcnElement.className = 'mcn-info';
                    mcnElement.textContent = `（MCN: ${mcnInfo}）`;
                    nameElement.appendChild(mcnElement);
                }
            }
        }

        const observer = new MutationObserver((mutations) => {
            const answers = document.querySelectorAll('.List-item:not(.processed-mcn)');
            answers.forEach(processAnswer);
        });

        observer.observe(document.querySelector('.List') || document.body, {
            childList: true,
            subtree: true
        });

        // 处理已有的回答
        const initialAnswers = document.querySelectorAll('.List-item');
        initialAnswers.forEach(processAnswer);
    }

    // 初始化
    async function initialize() {
        DataManager.createStatusElement();
        DataManager.addDownloadButton();
        DataManager.addExportButton();

        // 尝试从缓存加载数据
        DataManager.loadFromCache();

        if (window.location.pathname.startsWith('/people/')) {
            handlePeoplePage();
        } else if (window.location.pathname.startsWith('/question/')) {
            handleQuestionPage();
        }
    }

    // 页面加载完成后初始化
    window.addEventListener('load', initialize);
})();