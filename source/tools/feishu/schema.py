"""Single source of truth for the Feishu Base schema expected by cloud-function/index.js (const F).
Field types (Feishu bitable): 1=text, 2=number, 3=single select, 17=attachment.
The FIRST field of each table becomes its primary field (Feishu does not allow a
single-select primary field, so 外链 uses 标题 first)."""

TXT = lambda n: {"field_name": n, "type": 1}
NUM = lambda n: {"field_name": n, "type": 2, "property": {"formatter": "0"}}
SEL = lambda n, opts: {"field_name": n, "type": 3, "property": {"options": [{"name": o} for o in opts]}}
ATT = lambda n: {"field_name": n, "type": 17}
# v4.1: CAS hours per task, 0.5 steps (0.5–5, validated by the backend), shown with one decimal in Feishu
CAS = lambda n: {"field_name": n, "type": 2, "property": {"formatter": "0.0"}}

SPEC = {
    "活动记录": [TXT("活动名称"), TXT("日期"), SEL("组别", ["照片组", "视频组", "两者"]),
              SEL("状态", ["待选片", "精修中", "待交付", "已归档", "待剪辑", "调色中", "待发布", "已发布"]),
              SEL("类型", ["舞台", "运动", "联动", "公益", "招新", "课程", "其他"]), NUM("照片数"), NUM("视频数"),
              TXT("描述"), ATT("封面"), TXT("网盘链接"), TXT("提取码")],
    "照片素材": [TXT("活动"), ATT("文件"), TXT("网盘链接"), TXT("提取码"),
              SEL("分类", ["campus", "sports", "stage", "collab", "landscape"]), TXT("说明")],
    "外链": [TXT("标题"), SEL("平台", ["B站", "小红书", "其他"]), TXT("链接"), TXT("备注")],
    "成员": [TXT("姓名"), TXT("班级"), TXT("学号"), SEL("性别", ["男", "女", "无性别"]), TXT("职位"), TXT("技能"), TXT("备注")],
    "分组": [TXT("批次"), TXT("组名"), TXT("成员"), TXT("技能覆盖"), TXT("说明")],
    # v4：拍摄日历 / 报名交付 / AI 用量（新表，不影响 v3 的五张表）
    "拍摄任务": [TXT("名称"), SEL("类别", ["篮球", "足球", "匹克球", "乒乓球", "长绳", "文化周", "其他"]),
              TXT("日期"), TXT("时间"), TXT("地点"), NUM("需要人数"),
              SEL("状态", ["开放报名", "已安排", "已结束", "已取消"]), TXT("备注"), TXT("种子键"), TXT("来源申请"),
              CAS("CAS-C"), CAS("CAS-S")],  # v4.1：CAS 时间（C = Creativity，S = Service；没有 A）
    "报名与交付": [TXT("成员姓名"), TXT("学号"), TXT("任务ID"), TXT("任务名称"),
              SEL("状态", ["已报名", "已确认", "已交付", "已验收", "已退回", "已取消"]),
              TXT("百度网盘链接"), TXT("提取码"), TXT("描述"), TXT("AI文案"), TXT("报名时间"), TXT("提交时间"), TXT("管理备注")],
    "AI用量": [TXT("键"), TXT("月份"), TXT("功能"), NUM("调用次数"), NUM("输入tokens"), NUM("输出tokens"),
             {"field_name": "费用元", "type": 2, "property": {"formatter": "0.0000"}}, TXT("当日"), NUM("当日次数")],
}

ENV_VAR = {"活动记录": "TABLE_ACTIVITIES", "照片素材": "TABLE_PHOTOS", "外链": "TABLE_LINKS",
           "成员": "TABLE_MEMBERS", "分组": "TABLE_GROUPS",
           "拍摄任务": "TABLE_EVENTS", "报名与交付": "TABLE_APPLICATIONS", "AI用量": "TABLE_AI_USAGE"}
