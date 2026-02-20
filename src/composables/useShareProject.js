import { useTimelineStore } from '@/stores/timelineStore'
import { ElMessage } from 'element-plus'

export function useShareProject() {
    const store = useTimelineStore()

    // 1. 复制分享码
    async function copyShareCode() {
        try {
            // 获取压缩后的长字符串
            const shareStr = await store.exportShareString()

            // 写入剪贴板
            await navigator.clipboard.writeText(shareStr)
            ElMessage.success('The sharing code has been copied to your clipboard! You can send it to a friend to import.')
        } catch (e) {
            console.error(e)
            ElMessage.error('Share code generation failed: ' + e.message)
        }
    }

    // 2. 解析导入分享码
    function importFromCode(code) {
        if (!code) {
            ElMessage.warning('Please enter the sharing code.')
            return false
        }

        // 调用 Store 里的解压和合并逻辑
        const success = store.importShareString(code)

        if (success) {
            ElMessage.success('Successfully imported!')
            return true
        } else {
            ElMessage.error('Share code format error or data corruption')
            return false
        }
    }

    return {
        copyShareCode,
        importFromCode
    }
}
