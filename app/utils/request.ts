// const backurl = 'http://127.0.0.1:3000';
const backurl = 'https://api.streetdrip.top';

// const config = useRuntimeConfig()
// const backurl = config.public.backurl;

interface OssData {
    accessid: string;
    host: string;
    policy: string;
    signature: string;
    expire: number;
    callback: string;
    dir: string;
};

//获取oss token
export const getoss = async (dir: string) => {
    try {
        const data = await $fetch<OssData>(
            `${backurl}/oss/${dir}`
        );
        return data;
    } catch (error) {
        console.error('shareupload error:', error)
        return null;
    }
}

interface MergeParamsType {
    model: string;
    hat: string;
    eyewear: string;
    top: string;
    outerwear: string;
    bottom: string;
    shoes: string;
};

interface MergeResult {
    code: number;
    imgurl: string;
    message: string;
}

//合成图片
export const clothingmerge = async (MergeParams: MergeParamsType, token: string) => {
    try {
        // 1. 直接使用 $fetch，Nuxt 4 默认支持
        // 注意：Nuxt 4 的标准目录中，服务器接口在 server/api/ 目录下
        const data = await $fetch<MergeResult>(`${backurl}/photomerging/merge`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: 'POST',
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: MergeParams
        })
        return data;

    } catch (error) {
        console.error('clothingmerge error:', error)
        return { code: 6, imgurl: "", message: "clothingmerge error" };
    }
}

interface UpResult {
    code: number;
    id: number;
    message: string;
}

//上传合成图片
export const shareupload = async (pic: string, shareinfo: string, clothings: string, token: string) => {
    try {
        // 1. 直接使用 $fetch，Nuxt 4 默认支持
        // 注意：Nuxt 4 的标准目录中，服务器接口在 server/api/ 目录下
        const data = await $fetch<UpResult>(`${backurl}/photomerging/upload`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: 'POST',
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                pic, shareinfo, clothings, uid: 0
            }
        })
        return data;

    } catch (error) {
        console.error('shareupload error:', error)
        return { code: 3, id: 0, message: "shareupload error" };
    }
}

// 定义衣饰项的类型
interface ClothingItem {
    id: number;
    name: string;
    clothpart: string;
    showdate: string;
    brand: string;
    pic: string;
};

//获取更多首页衣服
export const getindexpage = async (page: number) => {
    try {
        const data = await $fetch<ClothingItem[]>(
            `${backurl}/sindex/${page}`
        );
        return data;
    } catch (error) {
        console.error('shareupload error:', error)
        return null;
    }
}

//搜索衣服
export const searchclothing = async (keystr:string) => {
    try {
        const data = await $fetch<ClothingItem[]>(
            `${backurl}/clothing/search`, {
            query: {
                keystr: keystr,
            },
        }
        );
        return data;
    } catch (error) {
        console.error('searchclothing error:', error)
        return null;
    }
}

// 定义衣饰项的类型
interface ShareBriefItem {
    id: number;
    pic: string;
};

//获取更多首页衣服
export const getmoreshare = async (id: number, page: number) => {
    try {
        const data = await $fetch<ShareBriefItem[]>(
            `${backurl}/share/getmore/${page}`, {
            query: {
                id: id,
            },
        }
        );
        return data;
    } catch (error) {
        console.error('getmoreshare error:', error)
        return null;
    }
}

// 定义你的用户数据接口
interface UpdateResult {
    code: number;
    message: string;
}


//上传头像
export const uploadavatar = async (osspurl: string, token: string): Promise<UpdateResult> => {
    try {
        const data = await $fetch<UpdateResult>(`${backurl}/users/uploadavatar`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "POST",
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                pic: osspurl,
            },
        });
        return data;

    } catch (error) {
        console.error('uploadavatar error:', error)
        return { code: 0, message: "error" };
    }
}

//上传model图片
export const uploadmodel = async (osspurl: string, token: string): Promise<UpdateResult> => {
    try {
        const data = await $fetch<UpdateResult>(`${backurl}/users/uploadmodel`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "POST",
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                pic: osspurl,
            },
        });
        return data;

    } catch (error) {
        console.error('uploadmodel error:', error)
        return { code: 0, message: "error" };
    }
}

//删除model图片
export const deletemodel = async (id: number, token: string): Promise<UpdateResult> => {
    try {
        const data = await $fetch<UpdateResult>(`${backurl}/users/deletemodel`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "POST",
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                pid: id,
            },
        });
        return data;

    } catch (error) {
        console.error('deletemodel error:', error)
        return { code: 0, message: "error" };
    }
}


//编辑用户名
export const nameedit = async (name: string, token: string): Promise<UpdateResult> => {
    try {
        const data = await $fetch<UpdateResult>(`${backurl}/users/nameedit`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "POST",
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                username: name,
            },
        });
        return data;

    } catch (error) {
        console.error('nameedit error:', error)
        return { code: 0, message: "error" };
    }
}


//编辑用户链接
export const linkedit = async (link: string, token: string): Promise<UpdateResult> => {
    try {
        const data = await $fetch<UpdateResult>(`${backurl}/users/linkedit`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "POST",
            // 2. 直接传对象！Nuxt 会自动帮你做 JSON.stringify 并带上 headers
            body: {
                linkurl: link
            },
        });
        return data;

    } catch (error) {
        console.error('linkedit error:', error)
        return { code: 0, message: "error" };
    }
}

interface ModelPicItem {
    pic: string;
    id: number;
}

//编辑用户链接
export const getmodels = async (token: string): Promise<ModelPicItem[]> => {
    try {
        const data = await $fetch<ModelPicItem[]>(`${backurl}/users/getmodels`, {
            headers: {
                // 显式地将 useCookie 拿到的 token 塞进 Authorization 传给 Fastify
                Authorization: `Bearer ${token}`,
            },
            method: "GET",
        });
        return data;

    } catch (error) {
        console.error('linkedit error:', error)
        return [];
    }
}
